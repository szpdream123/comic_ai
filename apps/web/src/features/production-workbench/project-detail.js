import { renderAssetExtractModal } from "./asset-extract-modal.js";
import { renderEpisodeWorkbench } from "./episode-workbench-rebuilt.js?video-category=1";
import { renderExportPanel } from "./export-panel.js";
import { resolveEpisodeWorkbenchPrompt } from "./episode-workbench-prompt.js";
import { renderProjectCreateModal } from "./project-create-modal.js";
import {
  renderOriginalScriptModal,
  renderScriptManagementPage,
} from "./script-page.js";
import { getProjectDetailState } from "./storyboard-state.js";
import { disabled, escapeAttr, escapeHtml } from "./markup.js";
import { renderLibraryTeam } from "../library-team/index.js";
import { resolveApiUrl } from "../../shared/creator-api.js";
import { createDefaultCanvasDocument, isLegacyStarterCanvasDocument } from "./canvas/canvas-default-document.js";
import {
  buildCanvasSidebarItems,
  resolveCanvasModelOptions,
  resolveCanvasNodeTemplates,
} from "./canvas/canvas-state.js";

const PROJECT_GALLERY_ROWS_PER_PAGE = 3;
const PROJECT_GALLERY_DEFAULT_COLUMNS = 4;
const PROJECT_GALLERY_MAX_COLUMNS = 12;
const CANVAS_VIDEO_GENERATION_MODES = [
  { id: "first-frame", label: "首帧生视频" },
  { id: "first-last-frame", label: "首尾帧生视频" },
  { id: "reference-video", label: "全能参考" },
];

const NAV_TABS = [
  { id: "home", label: "首页", icon: "home" },
  { id: "tools", label: "画布", icon: "wand" },
  { id: "script", label: "剧本", icon: "book" },
  { id: "project", label: "项目", icon: "clapperboard" },
  { id: "library", label: "资产库", icon: "archive" },
  { id: "team", label: "团队", icon: "users" },
];

const GROUPS = [
  { key: "characters", group: "character", label: "角色", accent: "violet" },
  { key: "scenes", group: "scene", label: "场景", accent: "teal" },
  { key: "props", group: "prop", label: "道具", accent: "amber" },
  { key: "others", group: "other", label: "其它", accent: "slate" },
];

const INTERIOR_NAV_ITEMS = [
  { id: "overview", icon: "◼", label: "总览" },
  { id: "assets", icon: "◻", label: "资产" },
  { id: "episodes", icon: "▣", label: "剧集" },
  { id: "members", icon: "◎", label: "成员" },
  { id: "stats", icon: "◌", label: "统计" },
];

const ASSET_TABS = [
  { id: "character", icon: "◉", label: "角色", search: "搜索你所需要的角色" },
  { id: "scene", icon: "⌂", label: "场景", search: "搜索你所需要的场景" },
  { id: "prop", icon: "✣", label: "道具", search: "搜索你所需要的道具" },
  { id: "other", icon: "◈", label: "其它", search: "搜索你所需要的视频" },
];

const ASSET_LIBRARY_CONFIG = {
  character: {
    label: "角色",
    tone: "character",
    generateCopy: "输入提示词通过生图模型生成角色图像",
    importCopy: "手动上传出镜角色的形象素材",
    art: "portrait",
    importedCardClass: "portrait",
    emptyTitle: "角色资源库暂时还是空的",
    emptyCopy: "导入角色后会按最新时间出现在这里，保留和生成入口会一起缩到左侧。",
    importHint: "如需使用 Seedance 2.0，请将角色保存为 Seedance 2.0 主体",
    importNote: "导入如示例中的角色三视图、主视图、特写，可获得更好的后续生成效果",
    importLinkLabel: "查看素材使用须知",
    dropzoneTitle: "点击或直接拖拽图片上传",
    dropzoneCopy: "可单次批量导入至多20个素材，提升操作效率",
    dropzoneMode: "character-mode",
    presetKind: "character",
    reviewFootnote: "保存为主体后可在生成视频时优先作为参考主体使用。",
    addDescriptionLabel: "添加角色描述",
  },
  scene: {
    label: "场景",
    tone: "scene",
    generateCopy: "输入提示词通过生图模型生成场景图像",
    importCopy: "手动上传出镜场景的参考素材",
    art: "diner",
    importedCardClass: "landscape",
    emptyTitle: "场景资源库暂时还是空的",
    emptyCopy: "导入场景后会在右侧以横版卡片展示，并按最新时间排序。",
    importHint: "建议上传横版完整场景图，便于后续生成保持空间关系一致",
    importNote: "可上传街道、室内、自然环境等高质量参考图，系统会自动生成场景名称。",
    importLinkLabel: "查看场景素材建议",
    dropzoneTitle: "点击或直接拖拽场景图片上传",
    dropzoneCopy: "支持 JPG、PNG 等常见图片格式，单次最多导入20张",
    presetKind: "scene",
    reviewFootnote: "确认后场景会立即出现在资源库中，并默认按最近导入排序。",
    addDescriptionLabel: "添加场景描述",
  },
  prop: {
    label: "道具",
    tone: "prop",
    generateCopy: "输入提示词通过生图模型生成道具图像",
    importCopy: "手动上传出镜道具的参考素材",
    art: "glasses",
    importedCardClass: "square",
    emptyTitle: "道具资源库暂时还是空的",
    emptyCopy: "导入道具后会以卡片形式显示在这里，方便后续分镜直接调用。",
    importHint: "建议上传主体清晰、背景干净的道具素材，识别效果会更稳定",
    importNote: "可上传武器、摆件、设备等素材，上传后可手动调整名称并确认导入。",
    importLinkLabel: "查看道具素材建议",
    dropzoneTitle: "点击或直接拖拽道具图片上传",
    dropzoneCopy: "支持批量上传，建议使用纯色或简单背景的参考图",
    presetKind: "prop",
    reviewFootnote: "确认后道具会进入资源库，并优先展示最新导入内容。",
    addDescriptionLabel: "添加道具描述",
  },
  other: {
    label: "其它",
    importedCardClass: "other",
    reviewFootnote: "确认后主体会进入当前资源库，并保持最新时间优先展示。",
    addDescriptionLabel: "添加主体描述",
  },
};

function isMockPreviewUrl(value) {
  return /mock-image-[^?]+\.(?:avif|png|webp)(?:\?|$)/i.test(String(value ?? "").trim());
}

function resolvePreferredPreviewUrl(...candidates) {
  const normalized = candidates
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  const realCandidate = normalized.find((value) => !isMockPreviewUrl(value));
  return realCandidate ?? normalized[0] ?? "";
}

function resolveLatestConversationPreview(historyMap = {}, assetId) {
  const entries = Array.isArray(historyMap?.[`image:${assetId ?? ""}`]) ? historyMap[`image:${assetId ?? ""}`] : [];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const images = Array.isArray(entries[index]?.fixedImages) ? entries[index].fixedImages : [];
    for (let imageIndex = images.length - 1; imageIndex >= 0; imageIndex -= 1) {
      const preview = resolvePreferredPreviewUrl(
        images[imageIndex]?.previewUrl,
        images[imageIndex]?.url,
        images[imageIndex]?.src,
      );
      if (preview && !isMockPreviewUrl(preview)) {
        return preview;
      }
    }
  }
  return "";
}

function resolveImportedAssetPreview(asset) {
  return resolvePreferredPreviewUrl(
    asset?.preview,
    asset?.previewUrl,
    asset?.fixedImageUrl,
    asset?.latestVersion?.metadata?.fixedImageUrl,
    asset?.latestVersion?.previewUrl,
    asset?.latestVersion?.metadata?.previewUrl,
    asset?.sourceUrl,
  );
}
export function renderProjectDetail(context = {}) {
  const { state = {}, ui = {}, session = { user: { phone: "" } } } = context;
  const detailState = getProjectDetailState(state);
  const progress = getProgress(state);
  const activeNavTab = ui.activeNavTab ?? "home";
  const creditBalance = resolveDisplayedCreditBalance(ui, session);

  if (activeNavTab === "project" && ui.projectPanelMode === "workspace") {
    return `
      <section class="production-workbench">
        ${renderWorkbenchRail(activeNavTab)}
        <section class="workbench-main workspace-mode">
          ${renderGlobalStatusbar(session, { hideBrand: true, creditBalance })}
          ${renderProjectInteriorShell({ state, ui, detailState })}
        </section>
      </section>
      ${renderAssetExtractModal({
        activeTab: ui.scriptTab,
        show: ui.isScriptModalOpen,
        uploadNotice: ui.uploadNotice,
        hasProject: Boolean(state.project),
        defaultScript: ui.scriptModalMode === "manual" ? (ui.scriptManualDraft ?? "") : (ui.defaultScript ?? ""),
        busy: ui.busy,
        submitAction: ui.scriptSubmitAction ?? "import-script-document",
        submitLabel: ui.scriptSubmitLabel ?? "开始分析",
        mode: ui.scriptModalMode ?? "full",
        lookControlsHtml: renderScriptManualLookControls(ui),
        scriptUploadFileName: ui.scriptUploadFileName ?? "",
      })}
      ${renderProjectCreateModal({
        show: ui.isCreateModalOpen,
        busy: ui.busy,
        defaultName: ui.createProjectName ?? "",
        selectedAspectRatio: ui.createAspectRatio ?? "9:16",
        selectedProjectType: ui.createProjectType ?? "animation",
        projectStyles: ui.projectStyles ?? [],
        isProjectStyleMenuOpen: ui.isProjectStyleMenuOpen,
        notice: ui.createProjectNotice ?? "",
      })}
      ${renderSingleEpisodeAiPreview(ui)}
      ${renderAccountSettingsDrawer(ui, session)}
    `;
  }

  if (activeNavTab === "project" && ui.projectPanelMode === "episode-workbench") {
    return `
      <section class="production-workbench">
        ${renderWorkbenchRail(activeNavTab)}
        ${renderEpisodeWorkbenchScreen({ state, ui, session })}
      </section>
      ${renderAssetExtractModal({
        activeTab: ui.scriptTab,
        show: ui.isScriptModalOpen,
        uploadNotice: ui.uploadNotice,
        hasProject: Boolean(state.project),
        defaultScript: ui.scriptModalMode === "manual" ? (ui.scriptManualDraft ?? "") : (ui.defaultScript ?? ""),
        busy: ui.busy,
        submitAction: ui.scriptSubmitAction ?? "import-script-document",
        submitLabel: ui.scriptSubmitLabel ?? "开始分析",
        mode: ui.scriptModalMode ?? "full",
        lookControlsHtml: renderScriptManualLookControls(ui),
        scriptUploadFileName: ui.scriptUploadFileName ?? "",
      })}
      ${renderProjectCreateModal({
        show: ui.isCreateModalOpen,
        busy: ui.busy,
        defaultName: ui.createProjectName ?? "",
        selectedAspectRatio: ui.createAspectRatio ?? "9:16",
        selectedProjectType: ui.createProjectType ?? "animation",
        projectStyles: ui.projectStyles ?? [],
        isProjectStyleMenuOpen: ui.isProjectStyleMenuOpen,
        notice: ui.createProjectNotice ?? "",
      })}
      ${renderSingleEpisodeAiPreview(ui)}
      ${renderAccountSettingsDrawer(ui, session)}
    `;
  }

  const toolsModeClass = activeNavTab === "tools"
    ? ` tools-mode ${ui.canvasProjectView === "detail" ? "tools-canvas-detail-mode" : "tools-canvas-list-mode"}`
    : "";
  return `
    <section class="production-workbench">
      ${renderWorkbenchRail(activeNavTab)}

      <section class="workbench-main ${activeNavTab === "home" ? "home-mode" : ""}${toolsModeClass}">
        ${renderGlobalStatusbar(session, { creditBalance })}
        ${renderMainPanel({ state, ui, session, detailState, progress, activeNavTab })}
      </section>
    </section>

      ${renderAssetExtractModal({
        activeTab: ui.scriptTab,
        show: ui.isScriptModalOpen,
        uploadNotice: ui.uploadNotice,
      hasProject: Boolean(state.project),
      defaultScript: ui.scriptModalMode === "manual" ? (ui.scriptManualDraft ?? "") : (ui.defaultScript ?? ""),
      busy: ui.busy,
      submitAction: ui.scriptSubmitAction ?? "import-script-document",
      submitLabel: ui.scriptSubmitLabel ?? "开始分析",
      mode: ui.scriptModalMode ?? "full",
      lookControlsHtml: renderScriptManualLookControls(ui),
      scriptUploadFileName: ui.scriptUploadFileName ?? "",
    })}
    ${renderProjectCreateModal({
      show: ui.isCreateModalOpen,
      busy: ui.busy,
      defaultName: ui.createProjectName ?? "",
      selectedAspectRatio: ui.createAspectRatio ?? "9:16",
      selectedProjectType: ui.createProjectType ?? "animation",
      projectStyles: ui.projectStyles ?? [],
      isProjectStyleMenuOpen: ui.isProjectStyleMenuOpen,
      notice: ui.createProjectNotice ?? "",
    })}
    ${renderOriginalScriptModal({
      show: ui.isOriginalScriptModalOpen,
      draft: ui.originalScriptDraft,
      busy: ui.busy,
    })}
    ${renderSingleEpisodeAiPreview(ui)}
    ${renderProjectRenameModal({
      show: Boolean(ui.renameProjectId),
      value: ui.renameProjectName ?? "",
      notice: ui.renameProjectNotice ?? "",
    })}
    ${renderProjectDeleteModal({
      show: Boolean(ui.deleteProjectId) || ui.deleteProjectMode === "bulk",
      mode: ui.deleteProjectMode === "bulk" ? "bulk" : "single",
      count: Array.isArray(ui.deleteProjectIds) ? ui.deleteProjectIds.length : 0,
      projectName:
        ui.projectLibrary?.find((project) => project.id === ui.deleteProjectId)?.name ?? "",
    })}
    ${renderCanvasProjectRenameModal({
      show: Boolean(ui.renameCanvasProjectId),
      value: ui.renameCanvasProjectName ?? "",
      notice: ui.renameCanvasProjectNotice ?? "",
    })}
    ${renderCanvasProjectDeleteModal({
      show: Boolean(ui.deleteCanvasProjectId),
      projectName:
        ui.canvasProjects?.find?.((project) => project.id === ui.deleteCanvasProjectId)?.title ?? "",
    })}
    ${renderGenerationQueueJobConfirmModal(ui)}
    ${renderCreditLedgerDrawer(ui)}
    ${renderAccountSettingsDrawer(ui, session)}
  `;
}

function renderCreditLedgerDrawer(ui = {}) {
  if (!ui.creditLedgerOpen) {
    return "";
  }
  const rows = Array.isArray(ui.creditLedgerRows) ? ui.creditLedgerRows : [];
  const summary = ui.creditLedgerSummary ?? {};
  const loading = ui.creditLedgerLoading === true;
  const error = String(ui.creditLedgerError ?? "").trim();
  return `
    <div class="credit-ledger-backdrop" data-action="close-credit-ledger" aria-hidden="true"></div>
    <aside class="credit-ledger-drawer" role="dialog" aria-modal="true" aria-labelledby="credit-ledger-title">
      <header class="credit-ledger-header">
        <div>
          <p class="credit-ledger-kicker">Credit Ledger</p>
          <h2 id="credit-ledger-title">积分明细</h2>
          <p>每一次充值、生成扣减与返还都会记录在这里。</p>
        </div>
        <button class="credit-ledger-close" type="button" data-action="close-credit-ledger" aria-label="关闭积分明细">×</button>
      </header>
      <section class="credit-ledger-summary" aria-label="积分概览">
        ${renderCreditLedgerMetric("可用积分", summary.displayAvailableCredits ?? 0, "available")}
        ${renderCreditLedgerMetric("累计消耗", summary.totalConsumedCredits ?? 0, "consumed")}
      </section>
      <div class="credit-ledger-toolbar">
        <span>${escapeHtml(String(ui.creditLedgerMeta?.total ?? rows.length))} 条最近记录</span>
        <button type="button" data-action="refresh-credit-ledger" ${loading ? "disabled" : ""}>刷新</button>
      </div>
      ${error ? `<p class="credit-ledger-notice error">${escapeHtml(error)}</p>` : ""}
      <div class="credit-ledger-scroll">
        ${loading && !rows.length ? renderCreditLedgerLoadingRows() : ""}
        ${!loading && !rows.length && !error ? `
          <div class="credit-ledger-empty">
            <strong>暂无积分记录</strong>
            <span>充值或生成任务发生后，这里会显示每一次变动。</span>
          </div>
        ` : ""}
        ${rows.length ? `
          <table class="credit-ledger-table">
            <thead>
              <tr>
                <th>任务ID</th>
                <th>类型</th>
                <th>说明</th>
                <th>可用变化</th>
                <th>失败|成功</th>
                <th>来源</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(renderCreditLedgerRow).join("")}
            </tbody>
          </table>
        ` : ""}
      </div>
    </aside>
  `;
}

function renderCreditLedgerMetric(label, value, tone) {
  return `
    <article class="credit-ledger-metric ${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(formatCreditNumber(value))}</strong>
    </article>
  `;
}

function renderCreditLedgerRow(row = {}) {
  const entry = normalizeCreditLedgerEntry(row);
  return `
    <tr>
      <td>${renderCreditLedgerTaskId(entry.taskId)}</td>
      <td><span class="credit-ledger-type ${escapeAttr(entry.tone)}">${escapeHtml(entry.label)}</span></td>
      <td>${renderCreditLedgerDescription(entry)}</td>
      <td class="${entry.availableDelta >= 0 ? "positive" : "negative"}">${escapeHtml(formatSignedCredit(entry.availableDelta))}</td>
      <td><span class="credit-ledger-type ${entry.result === "失败" ? "consume" : entry.result === "成功" ? "grant" : "neutral"}">${escapeHtml(entry.result)}</span></td>
      <td><span class="credit-ledger-source">${escapeHtml(entry.source)}</span></td>
      <td><time>${escapeHtml(formatLedgerDate(entry.createdAt))}</time></td>
    </tr>
  `;
}

function renderCreditLedgerDescription(entry = {}) {
  const title = String(entry.title ?? "").trim();
  const detail = String(entry.detail ?? "").trim();
  const text = [title, detail].filter(Boolean).join(" ");
  if (!text) {
    return `<span class="credit-ledger-description empty">-</span>`;
  }
  return `<span class="credit-ledger-description" data-full-text="${escapeAttr(text)}" tabindex="0"><span class="credit-ledger-description-text">${escapeHtml(text)}</span></span>`;
}

function renderCreditLedgerTaskId(taskId) {
  const fullId = String(taskId ?? "").trim();
  if (!fullId) {
    return `<code class="credit-ledger-task-id empty">-</code>`;
  }
  return `<code class="credit-ledger-task-id" data-full-id="${escapeAttr(fullId)}" tabindex="0">${escapeHtml(fullId.slice(0, 6))}</code>`;
}

function normalizeCreditLedgerEntry(row = {}) {
  const type = String(row.entryType ?? "");
  const metadata = normalizeLedgerMetadata(row.metadata);
  const labels = {
    grant: ["充值/发放", "grant"],
    consume: ["生成扣减", "consume"],
    reservation: ["生成扣减", "consume"],
    reserve: ["生成扣减", "consume"],
    release: ["释放返还", "release"],
  };
  const [label, tone] = labels[type] ?? ["积分变动", "neutral"];
  const amount = Number(row.amount ?? 0);
  const availableDelta = Number(row.availableDelta ?? row.available_delta ?? 0);
  const reason = String(row.reason ?? metadata.reason ?? "").trim();
  const model = creditLedgerModelLabel(metadata);
  const task = String(metadata.taskId ?? metadata.task_id ?? row.sourceId ?? "").trim();
  const event = String(metadata.billingEvent ?? metadata.outcome ?? metadata.status ?? "").trim();
  const eventLabel = ledgerBillingEventLabel(event);
  const duration = formatLedgerDuration(metadata.durationMs ?? metadata.duration_ms);
  const promptPreview = String(metadata.promptPreview ?? metadata.prompt_preview ?? "").trim();
  const failureCode = String(metadata.failureCode ?? metadata.failure_code ?? "").trim();
  const errorMessage = String(metadata.errorMessage ?? metadata.error_message ?? "").trim();
  const source = creditLedgerSourceLabel(row, metadata);
  const content = promptPreview ? `内容：${promptPreview}` : "";
  const failure = creditLedgerFailureLabel(failureCode, errorMessage);
  const result = creditLedgerResultLabel({ event, failure });
  const description = failure
    ? `失败：${failure}`
    : [eventLabel, model, content, duration ? `耗时 ${duration}` : ""].filter(Boolean).join(" · ") || "系统账本记录";
  const title = translateCreditLedgerReason(reason, metadata) || [source, eventLabel].filter(Boolean).join(" · ") || label;
  return {
    label,
    tone,
    amount: type === "consume" ? -Math.abs(amount) : amount,
    availableDelta,
    createdAt: row.createdAt,
    taskId: task || String(row.sourceId ?? "").trim(),
    title,
    detail: description,
    result,
    source,
  };
}

function normalizeLedgerMetadata(metadata) {
  if (metadata && typeof metadata === "object") {
    return metadata;
  }
  if (typeof metadata !== "string" || !metadata.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(metadata);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function creditLedgerSourceLabel(row = {}, metadata = {}) {
  const targetType = String(metadata.targetType ?? metadata.target_type ?? "").trim().toLowerCase();
  const mediaType = String(metadata.mediaType ?? metadata.kind ?? "").trim().toLowerCase();
  const sourceType = String(row.sourceType ?? row.source_type ?? "").trim().toLowerCase();
  if (targetType === "canvas") {
    if (mediaType === "video") {
      return "画布视频生成";
    }
    return "画布图片生成";
  }
  if (sourceType === "episode_generation_task") {
    return mediaType === "video" ? "分镜视频生成" : "分镜图片生成";
  }
  if (sourceType === "payment_order") {
    return "订单充值";
  }
  if (sourceType.includes("admin") || sourceType.includes("manual")) {
    return "人工调整";
  }
  if (mediaType === "video") {
    return "视频生成";
  }
  if (mediaType === "image") {
    return "图片生成";
  }
  return "积分账本";
}

function creditLedgerModelLabel(metadata = {}) {
  const explicit = String(metadata.modelLabel ?? metadata.model_label ?? "").trim();
  if (explicit) {
    return explicit;
  }
  const code = String(metadata.modelCode ?? metadata.model_code ?? metadata.providerExecutor ?? metadata.provider ?? "").trim();
  const normalized = code.toLowerCase();
  if (!normalized) {
    return "";
  }
  if (normalized.includes("jimeng")) {
    return normalized.includes("video") ? "即梦视频模型" : "即梦图片模型";
  }
  if (normalized.includes("seedance")) {
    return "豆包视频模型";
  }
  if (normalized.includes("gpt")) {
    return "OpenAI 图片模型";
  }
  if (normalized.includes("liblib")) {
    return "哩布哩布模型";
  }
  if (normalized.includes("kling")) {
    return "可灵模型";
  }
  if (normalized.includes("wan") || normalized.includes("qwen")) {
    return "通义生成模型";
  }
  return `模型 ${code}`;
}

function translateCreditLedgerReason(reason, metadata = {}) {
  const normalized = String(reason ?? "").trim().toLowerCase();
  const mediaType = String(metadata.mediaType ?? metadata.kind ?? "").trim().toLowerCase();
  const targetType = String(metadata.targetType ?? metadata.target_type ?? "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  if (normalized === "image generation") {
    return targetType === "canvas" ? "画布图片生成" : "图片生成";
  }
  if (normalized === "video generation") {
    return targetType === "canvas" ? "画布视频生成" : "视频生成";
  }
  if (normalized === "reservation allocation released") {
    return mediaType === "video" ? "视频生成积分返还" : "图片生成积分返还";
  }
  if (normalized === "reservation allocation consumed") {
    return mediaType === "video" ? "视频生成积分扣减" : "图片生成积分扣减";
  }
  if (normalized.includes("reservation") || normalized.includes("reserve")) {
    return mediaType === "video" ? "视频生成积分扣减" : "图片生成积分扣减";
  }
  return reason;
}

function creditLedgerFailureLabel(code, message) {
  const normalizedCode = String(code ?? "").trim();
  const normalizedMessage = String(message ?? "").trim();
  const labels = {
    task_timeout: "任务超时，积分已返还",
    provider_poll_timeout: "模型处理超时，积分已返还",
    provider_failed: "模型处理失败，积分已返还",
    provider_submission_failed: "发送模型失败，积分已返还",
    provider_submission_ambiguous: "模型接收状态不明确，已进入失败处理",
    provider_output_download_failed: "模型结果下载失败，积分已返还",
    provider_output_upload_failed: "结果保存失败，积分已返还",
    provider_output_persist_failed: "结果入库失败，积分已返还",
    provider_result_unknown: "模型结果状态未知，积分已返还",
    worker_crashed_after_external_start: "后台处理意外中断，积分已返还",
    generation_queue_unavailable: "生成队列未启动，未继续扣减",
  };
  const translated = labels[normalizedCode];
  if (translated && normalizedMessage) {
    return `${translated}（${normalizedMessage}）`;
  }
  if (translated) {
    return translated;
  }
  if (normalizedMessage) {
    return normalizedMessage;
  }
  return normalizedCode ? `失败代码：${normalizedCode}` : "";
}

function creditLedgerResultLabel({ event, failure } = {}) {
  const normalized = String(event ?? "").toLowerCase();
  if (failure || normalized.includes("failed") || normalized.includes("timeout")) {
    return "失败";
  }
  if (["consumed", "released", "succeeded", "reserved"].includes(normalized)) {
    return "成功";
  }
  return "-";
}

function ledgerBillingEventLabel(value) {
  const labels = {
    reserved: "已扣减",
    consumed: "已扣减",
    released: "已返还",
    manual_review_required: "待复核",
    failed: "失败",
    succeeded: "成功",
  };
  return labels[value] ?? "";
}

function formatLedgerDuration(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "";
  }
  if (numeric < 1000) {
    return `${Math.round(numeric)}ms`;
  }
  return `${Math.round(numeric / 100) / 10}s`;
}

function shortLedgerId(value) {
  const text = String(value ?? "").trim();
  if (text.length <= 12) {
    return text;
  }
  return `${text.slice(0, 8)}...${text.slice(-4)}`;
}

function renderCreditLedgerLoadingRows() {
  return `
    <div class="credit-ledger-loading">
      <span></span><span></span><span></span>
    </div>
  `;
}

function formatCreditNumber(value) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.round(numeric).toLocaleString("zh-CN") : "0";
}

function formatSignedCredit(value) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric) || numeric === 0) {
    return "0";
  }
  return `${numeric > 0 ? "+" : "-"}${Math.abs(Math.round(numeric)).toLocaleString("zh-CN")}`;
}

function formatLedgerDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderAccountSettingsDrawer(ui = {}, session = {}) {
  if (!ui.accountSettingsOpen) {
    return "";
  }

  const form = normalizeAccountSettingsForm(ui.accountSettingsForm, session);
  const passwordExpanded = ui.accountSettingsPasswordExpanded !== false;
  const dirty = ui.accountSettingsDirty === true;
  const saving = ui.busy && ui.accountSettingsOpen;
  const notice = String(ui.accountSettingsNotice ?? "").trim();

  return `
    <div class="account-settings-backdrop" data-action="close-account-settings" aria-hidden="true"></div>
    <aside class="account-settings-drawer" role="dialog" aria-modal="true" aria-labelledby="account-settings-title">
      <header class="account-settings-header">
        <div>
          <p class="account-settings-kicker">Account Console</p>
          <h2 id="account-settings-title">账号设置</h2>
          <p class="account-settings-subtitle">管理你的公开信息、登录安全与消息偏好。</p>
        </div>
        <button class="account-settings-close" type="button" data-action="close-account-settings" aria-label="关闭账号设置">×</button>
      </header>

      <section class="account-settings-hero">
        <div class="account-settings-avatar" aria-hidden="true">${escapeHtml(resolveAccountSettingsAvatarLabel(form, session))}</div>
        <div class="account-settings-hero-copy">
          <strong>${escapeHtml(form.displayName || "未命名创作者")}</strong>
          <span>${escapeHtml(form.phone || "未绑定手机号")}</span>
          <span>${escapeHtml(form.planLabel)}</span>
        </div>
      </section>

      <div class="account-settings-scroll">
        <section class="account-settings-card">
          <div class="account-settings-card-head">
            <span>基础资料</span>
            <em>Profile</em>
          </div>
          <label class="account-settings-field">
            <span>显示昵称</span>
            <input
              type="text"
              value="${escapeAttr(form.displayName)}"
              maxlength="40"
              placeholder="请输入显示昵称"
              data-action="change-account-settings-field"
              data-field="displayName"
            />
          </label>
          <label class="account-settings-field readonly">
            <span>绑定手机号</span>
            <div class="account-settings-static-field">
              <input type="text" value="${escapeAttr(form.phone)}" readonly />
              <button type="button" data-action="account-settings-placeholder" data-message="手机号更换功能将在后续版本开放。">更换</button>
            </div>
          </label>
        </section>

        <section class="account-settings-card">
          <div class="account-settings-card-head">
            <span>账号安全</span>
            <em>Security</em>
          </div>
          <div class="account-settings-security-row">
            <div>
              <strong>修改密码</strong>
              <span>更新登录密码，保护你的创作资产与团队协作空间。</span>
            </div>
            <button type="button" data-action="toggle-account-settings-password">
              ${passwordExpanded ? "收起" : "修改密码"}
            </button>
          </div>
          ${
            passwordExpanded
              ? `
                <div class="account-settings-password-grid">
                  <label class="account-settings-field">
                    <span>当前密码</span>
                    <input
                      type="password"
                      value="${escapeAttr(form.currentPassword)}"
                      placeholder="请输入当前密码"
                      data-action="change-account-settings-field"
                      data-field="currentPassword"
                    />
                  </label>
                  <label class="account-settings-field">
                    <span>新密码</span>
                    <input
                      type="password"
                      value="${escapeAttr(form.newPassword)}"
                      placeholder="至少 8 位"
                      data-action="change-account-settings-field"
                      data-field="newPassword"
                    />
                  </label>
                  <label class="account-settings-field">
                    <span>确认新密码</span>
                    <input
                      type="password"
                      value="${escapeAttr(form.confirmPassword)}"
                      placeholder="再次输入新密码"
                      data-action="change-account-settings-field"
                      data-field="confirmPassword"
                    />
                  </label>
                </div>
              `
              : ""
          }
        </section>

      </div>

      <footer class="account-settings-footer">
        <div class="account-settings-footer-copy">
          <strong>${dirty ? "有未保存的更改" : "当前更改已同步"}</strong>
          <span>${escapeHtml(notice || "保存后会立即在当前工作台生效。")}</span>
        </div>
        <div class="account-settings-footer-actions">
          <button type="button" class="ghost" data-action="close-account-settings">取消</button>
          <button type="button" class="primary" data-action="submit-account-settings" ${saving ? "disabled" : ""}>保存更改</button>
        </div>
      </footer>
    </aside>
  `;
}

function normalizeAccountSettingsForm(form = {}, session = {}) {
  const user = session?.user ?? {};
  const notifications = form.notifications ?? {};
  return {
    displayName: String(form.displayName ?? user.displayName ?? ""),
    phone: String(form.phone ?? user.phone ?? ""),
    email: String(form.email ?? user.email ?? ""),
    currentPassword: String(form.currentPassword ?? ""),
    newPassword: String(form.newPassword ?? ""),
    confirmPassword: String(form.confirmPassword ?? ""),
    notifications: {
      projectUpdates: notifications.projectUpdates !== false,
      renderComplete: notifications.renderComplete !== false,
      marketing: notifications.marketing === true,
    },
    planLabel: String(form.planLabel ?? user.planLabel ?? "当前方案 · 创作者版"),
  };
}

function resolveAccountSettingsAvatarLabel(form, session = {}) {
  const preferred = String(form.displayName || session?.user?.displayName || session?.user?.phone || "我").trim();
  return [...preferred].slice(0, 2).join("");
}

function renderWorkspaceStatusToast(message, extraClassName = "") {
  const toast = normalizeWorkspaceToast(message);
  const normalizedMessage = toast.message;
  if (!normalizedMessage) {
    return "";
  }
  const tone = toast.tone || resolveWorkspaceToastTone(normalizedMessage);
  const title = tone === "error" ? "操作失败" : "操作成功";
  const className = extraClassName
    ? `workbench-toast global-workbench-toast ${tone} ${extraClassName}`
    : `workbench-toast global-workbench-toast ${tone}`;
  return `
    <div id="workspace-status" class="${className}" role="status" aria-live="polite">
      <strong>${title}</strong>
      <span>${escapeHtml(normalizedMessage)}</span>
    </div>
  `;
}

function normalizeWorkspaceToast(message) {
  if (message && typeof message === "object" && !Array.isArray(message)) {
    const normalizedMessage = String(message.message ?? message.text ?? "").trim();
    const tone = String(message.tone ?? "").trim().toLowerCase();
    return {
      message: normalizedMessage,
      tone: tone === "error" || tone === "success" ? tone : "",
    };
  }
  return { message: String(message ?? "").trim(), tone: "" };
}

function resolveWorkspaceToastTone(message) {
  const normalizedMessage = String(message ?? "").toLowerCase();
  const errorMarkers = [
    "失败",
    "错误",
    "未找到",
    "不可",
    "不能",
    "无法",
    "缺少",
    "请先",
    "请输入",
    "请选择",
    "failed",
    "failure",
    "error",
    "denied",
  ];
  return errorMarkers.some((marker) => normalizedMessage.includes(marker)) ? "error" : "success";
}

function resolveDisplayedCreditBalance(ui, session = {}) {
  const candidates = [
    session?.user?.availableCredits,
    session?.user?.creditBalance,
    session?.user?.credits,
    session?.availableCredits,
    session?.creditBalance,
    ui.creditBalance,
    ui.episodeGenerationConfig?.creditBalance,
    ui.episodeWorkbenchContext?.creditBalance,
    ui.lastPaymentIntent?.creditBalance,
  ];
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric >= 0) {
      return numeric;
    }
  }
  return 0;
}

function renderWorkbenchRail(activeNavTab) {
  return `
    <aside class="workbench-rail persistent" aria-label="工作台导航">
      <nav class="rail-nav" role="tablist" aria-label="主导航">
        ${NAV_TABS.map((tab) => renderRailTab(tab, activeNavTab)).join("")}
      </nav>
      <button class="rail-item rail-bottom" type="button" data-action="logout">退出</button>
    </aside>
  `;
}

function renderEpisodeWorkbenchScreen({ state, ui, session }) {
  const episodes = getEpisodeHubEntries(state, ui);
  const hasRealEpisodes = episodes.some((episode) => episode?.id && episode.id !== "episode-primary");
  const selectedEpisodeId =
    ui.selectedEpisodeId && episodes.some((episode) => episode.id === ui.selectedEpisodeId)
      ? ui.selectedEpisodeId
      : null;
  const fallbackEpisodeId = selectedEpisodeId ?? episodes[0]?.id ?? (hasRealEpisodes ? "" : "episode-primary");
  const activeEpisode =
    episodes.find((episode) => episode.id === fallbackEpisodeId) ??
    episodes[0] ??
    {
      id: hasRealEpisodes ? "" : "episode-primary",
      title: "剧一",
      storyboardCount: Array.isArray(ui.storyboards) ? ui.storyboards.length : 0,
    };
  const activeStoryboardEpisodeId = activeEpisode?.id || (hasRealEpisodes ? "" : "episode-primary");
  const activeStoryboards = getEpisodePreviewStoryboards(activeStoryboardEpisodeId, ui);
  const selectedStoryboard =
    activeStoryboards.find((storyboard) => storyboard.id === ui.selectedStoryboardId) ??
    ui.selectedStoryboard ??
    activeStoryboards[0] ??
    null;
  const workbenchPrompt = resolveEpisodeWorkbenchPrompt(ui, activeStoryboards);
  const episodeTitle = activeEpisode?.title ?? "Episode 1";
  const episodeStatus = activeEpisode?.status ?? "Draft";
  const storyboardCount = activeEpisode?.storyboardCount ?? activeStoryboards.length ?? 0;
  const episodeWorkbenchAssetLibrary = resolveEpisodeWorkbenchAssetLibrary(ui);

  return `
    <section class="episode-workbench-screen" aria-label="episode-workbench">
      ${renderEpisodeWorkbench({
        session,
        episodeId: activeEpisode?.id ?? "",
        episodeTitle: activeEpisode?.title ?? "",
        storyboards: activeStoryboards,
        selectedStoryboard,
        assetLibrary: episodeWorkbenchAssetLibrary,
        activeAssetTab: ui.projectAssetTab ?? "character",
        selectedEpisodeCardId: ui.selectedEpisodeCardId ?? null,
        selectedEpisodeAssetId: ui.selectedEpisodeAssetId ?? null,
        selectedEpisodeAssetIds: ui.selectedEpisodeAssetIds ?? [],
        selectedStoryboardIds: ui.selectedStoryboardIds ?? [],
        episodeWorkbenchSelectedAttachmentIds: ui.episodeWorkbenchSelectedAttachmentIds ?? [],
        isStoryboardDescriptionModalOpen: Boolean(ui.isStoryboardDescriptionModalOpen),
        storyboardDescriptionDraft: ui.storyboardDescriptionDraft ?? "",
        selectedModelId: ui.selectedModelId,
        prompt: workbenchPrompt,
        busy: ui.busy,
        canParse: Boolean(state.project),
        canCalibrate: Boolean(state.assetReview?.readyForGeneration && activeStoryboards.length),
        canGenerateImages: Boolean(state.calibration && activeStoryboards.length),
        canGenerateVideos: Boolean(
          state.calibration &&
            (
              selectedStoryboard?.imageStatus === "ready" ||
              activeStoryboards.some((storyboard) => storyboard.imageStatus === "ready")
            ),
        ),
        validationMessage: ui.validationMessage ?? "",
        calibrationSkipReason: ui.calibrationSkipReason ?? "",
        calibrationOverrideReason: ui.calibrationOverrideReason ?? "",
        imageGenerationResult: ui.imageGenerationResult ?? null,
        videoGenerationResult: ui.videoGenerationResult ?? null,
        mediaMode: ui.episodeMediaMode ?? "image",
        videoMode: ui.videoGenerationMode ?? "reference-video",
        imageMode: ui.imageGenerationMode ?? "single-image",
        generationControls: {
          videoDurationSec: ui.videoDurationSec,
          videoResolution: ui.videoResolution,
          videoCount: ui.videoCount,
          videoAudioEnabled: ui.videoAudioEnabled,
          videoMusicEnabled: ui.videoMusicEnabled,
          videoLipSyncEnabled: ui.videoLipSyncEnabled,
          imageCount: ui.imageCount,
          imageResolution: ui.imageResolution,
          imageAspectRatio: ui.imageAspectRatio,
          multiImageStrategy: ui.multiImageStrategy,
          parameterValues: ui.generationParameterValues ?? null,
          uploadLimits: ui.episodeGenerationConfig?.uploadLimits ?? null,
        },
        episodeGenerationConfig: ui.episodeGenerationConfig ?? null,
        generationUiState: {
          isVideoModelMenuOpen: Boolean(ui.isVideoModelMenuOpen),
          openGenerationSelectMenu: ui.openGenerationSelectMenu ?? null,
          isFirstFrameMenuOpen: Boolean(ui.isFirstFrameMenuOpen),
          activeGenerationFrameMenu: ui.activeGenerationFrameMenu ?? null,
          isGenerationConsoleCollapsed: Boolean(ui.isGenerationConsoleCollapsed),
          imageGenerationMode: ui.imageGenerationMode ?? "single-image",
          videoGenerationMode: ui.videoGenerationMode ?? "reference-video",
          museBoardMode: ui.museBoardMode ?? "operation",
          museScopeMode: ui.museScopeMode ?? "storyboard",
          musePromptMenu: ui.musePromptMenu ?? null,
          promptMentionMenuOpen: Boolean(ui.promptMentionMenuOpen),
          promptMentionQuery: ui.promptMentionQuery ?? "",
          promptMentionSuggestions: ui.promptMentionSuggestions ?? [],
          promptMentionPreviewOpen: Boolean(ui.promptMentionPreviewOpen),
          promptMentionPreviewAsset: ui.promptMentionPreviewAsset ?? null,
          referencePromptPreset: ui.referencePromptPreset ?? "none",
          assetPromptDraft: ui.assetPromptDraft ?? null,
          assetConversationHistory: ui.assetConversationHistory ?? {},
          storyboardConversationHistory: ui.storyboardConversationHistory ?? {},
          lipSyncVoiceId: ui.lipSyncVoiceId ?? null,
          lipSyncVoiceName: ui.lipSyncVoiceName ?? "",
          lipSyncVoiceSource: ui.lipSyncVoiceSource ?? null,
          lipSyncAudioItems: ui.lipSyncAudioItems ?? [],
        },
        storyboardDeleteTarget: ui.storyboardDeleteId ?? null,
        storyboardImageDeleteTarget: ui.storyboardImageDeleteTarget ?? null,
        storyboardVideoDeleteTarget: ui.storyboardVideoDeleteTarget ?? null,
        generationResultDeleteTarget: ui.generationResultDeleteTarget ?? null,
        episodeAssetCreateModal: ui.episodeAssetCreateModal ?? null,
        assetInspector: ui.assetInspector ?? null,
        episodeWorkbenchAttachments: ui.episodeWorkbenchAttachments ?? [],
        episodeVoiceModal: ui.episodeVoiceModal ?? null,
        generationPollingActive: Boolean(ui.generationPollingActive),
        imageGenerationResult: ui.imageGenerationResult ?? null,
        videoGenerationResult: ui.videoGenerationResult ?? null,
        assetSearchQuery: ui.assetSearchQuery ?? "",
        exportPreviewResult: ui.exportPreviewResult ?? null,
        exportOptionModal: ui.exportOptionModal ?? null,
        episodeBatchModal: ui.episodeBatchModal ?? null,
        assetImportModal: ui.assetImportModal ?? null,
        assetImportModalTab: ui.assetImportModalTab ?? "local",
        episodeAssetLibraryModal: ui.episodeAssetLibraryModal ?? null,
        episodeAssetLibraryCategory: ui.episodeAssetLibraryCategory ?? ui.projectAssetTab ?? "character",
        episodeAssetLibraryFolder: ui.episodeAssetLibraryFolder ?? "",
        episodeAssetLibraryQuery: ui.episodeAssetLibraryQuery ?? "",
        assetImportCategory: ui.assetImportCategory ?? "domestic-modern-city",
        assetImportDrafts: ui.assetImportDrafts ?? [],
        assetImportSelection: ui.assetImportSelection ?? [],
        assetImportPage: ui.assetImportPage ?? 1,
        assetImportPageSize: ui.assetImportPageSize ?? 10,
        assetImportPageSizeMenuOpen: Boolean(ui.assetImportPageSizeMenuOpen),
        assetImportOfficialAssets: ui.assetImportOfficialAssets ?? null,
        projectLibraryAssetsByType: ui.projectLibraryAssetsByType ?? null,
        projectOtherAssetMediaType: ui.projectOtherAssetMediaType ?? "video",
        projectDetail: ui.projectDetail ?? null,
      })}
      ${renderWorkspaceStatusToast(ui.toast, "interior-toast")}
    </section>
  `;
}

function resolveEpisodeWorkbenchAssetLibrary(ui) {
  const importedAssets = ui.importedAssets ?? {};
  const resolvedContext = resolveEpisodeWorkbenchContextPayload(ui.episodeWorkbenchContext);
  const contextAssets =
    resolvedContext?.assetsByType ??
    resolvedContext?.assets ??
    resolvedContext?.episodeAssets ??
    ui.episodeWorkbenchContext?.data?.assetsByType ??
    ui.episodeWorkbenchContext?.data?.assets ??
    ui.episodeWorkbenchContext?.data?.episodeAssets ??
    ui.episodeWorkbenchContext?.assetsByType ??
    ui.episodeWorkbenchContext?.assets ??
    ui.episodeWorkbenchContext?.episodeAssets ??
    null;
  if (contextAssets && typeof contextAssets === "object") {
    return {
      character: mapEpisodeWorkbenchContextAssets(
        resolveEpisodeWorkbenchAssetEntries(contextAssets, "character"),
        "character",
      ),
      scene: mapEpisodeWorkbenchContextAssets(
        resolveEpisodeWorkbenchAssetEntries(contextAssets, "scene"),
        "scene",
      ),
      prop: mapEpisodeWorkbenchContextAssets(
        resolveEpisodeWorkbenchAssetEntries(contextAssets, "prop"),
        "prop",
      ),
    };
  }

  return {
    character: applyConversationPreviewFallback(importedAssets.character ?? [], ui.assetConversationHistory ?? {}),
    scene: applyConversationPreviewFallback(importedAssets.scene ?? [], ui.assetConversationHistory ?? {}),
    prop: applyConversationPreviewFallback(importedAssets.prop ?? [], ui.assetConversationHistory ?? {}),
  };
}

function applyConversationPreviewFallback(assets = [], historyMap = {}) {
  return (Array.isArray(assets) ? assets : []).map((asset) => {
    const preferredPreview = resolvePreferredPreviewUrl(
      asset?.preview,
      asset?.previewUrl,
      asset?.fixedImageUrl,
      asset?.latestVersion?.previewUrl,
    );
    if (preferredPreview && !isMockPreviewUrl(preferredPreview)) {
      return asset;
    }
    const conversationPreview = resolveLatestConversationPreview(historyMap, asset?.assetId ?? asset?.id ?? null);
    if (!conversationPreview) {
      return asset;
    }
    return {
      ...asset,
      preview: conversationPreview,
      previewUrl: conversationPreview,
      fixedImageUrl: conversationPreview,
    };
  });
}

function resolveEpisodeWorkbenchContextPayload(context) {
  if (!context || typeof context !== "object") {
    return null;
  }
  const nestedData = context?.data;
  if (nestedData && typeof nestedData === "object") {
    return nestedData;
  }
  return context;
}

function resolveEpisodeWorkbenchAssetEntries(assetsByType, kind) {
  if (!assetsByType || typeof assetsByType !== "object") {
    return [];
  }
  const keys =
    kind === "character"
      ? ["character", "characters", "role", "roles"]
      : kind === "scene"
        ? ["scene", "scenes"]
        : ["prop", "props"];
  for (const key of keys) {
    const value = assetsByType?.[key];
    if (Array.isArray(value) && value.length > 0) {
      return value;
    }
    if (value && typeof value === "object" && Array.isArray(value.items) && value.items.length > 0) {
      return value.items;
    }
  }
  return [];
}

function mapEpisodeWorkbenchContextAssets(assets = [], kind) {
  return (Array.isArray(assets) ? assets : []).map((asset) => ({
    id: asset?.assetId ?? asset?.id ?? "",
    assetId: asset?.assetId ?? asset?.id ?? null,
    name: asset?.name ?? asset?.label ?? "未命名资产",
    preview: resolvePreferredPreviewUrl(asset?.fixedImageUrl, asset?.previewUrl),
    previewUrl: resolvePreferredPreviewUrl(asset?.fixedImageUrl, asset?.previewUrl),
    description: asset?.description ?? "",
    kind,
    source: "episode",
    assetSource: "episode",
    voiceId: asset?.voiceId ?? null,
    voiceName: asset?.voiceName ?? "",
    voiceSource: asset?.voiceSource ?? "custom",
    dubbingConfig: asset?.dubbingConfig ?? null,
    updatedAt: asset?.updatedAt ?? null,
    fixedImageFileId: asset?.fixedImageFileId ?? null,
    fixedImageUrl: resolvePreferredPreviewUrl(asset?.fixedImageUrl, asset?.previewUrl),
    fixedImageStorageObjectId: asset?.fixedImageStorageObjectId ?? null,
  }));
}

function renderProjectInteriorShell({ state, ui, detailState }) {
  const selectedProject = getSelectedProjectCard(ui);
  const projectName = selectedProject?.name || detailState.project.name || "未命名项目";
  const statusLabel = normalizeProjectStatus(
    selectedProject?.status || detailState.project.statusLabel || "未开始",
  );
  const statusTone = getStatusTone(statusLabel);
  const aspectRatio = detailState.project.aspectRatio || "16:9";
  const hasAssets = Boolean(state.assetCandidates);
  const episodeCount = detailState.episodes?.length ?? 0;
  const activeInteriorSection = ui.projectInteriorSection ?? "overview";
  const activeAssetTab = ui.projectAssetTab ?? "character";

  return `
    <section class="project-interior" aria-label="项目内部工作台">
      <header class="project-interior-topbar">
        <div class="project-switcher">
          <button class="project-back-button" type="button" data-action="set-nav-tab" data-tab="project" aria-label="返回项目列表">返回</button>
          <strong>${escapeHtml(projectName)}</strong>
          <button
            class="project-status-select"
            type="button"
            data-action="toggle-project-interior-status-menu"
            aria-expanded="${ui.projectInteriorStatusMenuOpen ? "true" : "false"}"
            aria-label="项目状态"
          >
            <span class="status-dot ${statusTone}" aria-hidden="true"></span>
            ${escapeHtml(statusLabel)}
            <span aria-hidden="true">${ui.projectInteriorStatusMenuOpen ? "⌃" : "⌄"}</span>
          </button>
          ${ui.projectInteriorStatusMenuOpen ? renderProjectInteriorStatusMenu(statusLabel) : ""}
        </div>
      </header>

      <aside class="project-side-rail" aria-label="项目内导航">
        ${INTERIOR_NAV_ITEMS.map((item) =>
          renderInteriorNavItem(item, activeInteriorSection === item.id),
        ).join("")}
      </aside>

      <main class="project-interior-main">
        ${
          activeInteriorSection === "assets"
            ? renderProjectAssetLibrary({ state, ui, activeAssetTab })
            : activeInteriorSection === "episodes"
              ? renderProjectEpisodesInterior({ state, ui })
              : activeInteriorSection === "members"
                ? renderProjectMembersInterior(ui)
                : activeInteriorSection === "stats"
                  ? renderProjectStatsInterior(ui)
            : renderProjectOverviewInterior({
                state,
                ui,
                detailState,
                aspectRatio,
                hasAssets,
                episodeCount,
              })
        }
        ${renderWorkspaceStatusToast(ui.toast, "interior-toast")}
      </main>
      <button class="interior-help-button" type="button" aria-label="智能助手">✦</button>
      ${ui.assetGeneratorModal ? renderAssetGeneratorModal(ui) : ""}
      ${ui.assetImportModal ? renderAssetImportModal(ui) : ""}
      ${ui.isSingleEpisodeModalOpen ? renderSingleEpisodeModal(ui) : ""}
      ${renderEpisodeRenameModal(ui)}
      ${renderEpisodeDeleteModal(ui)}
      ${renderImportedAssetRenameModal(ui)}
      ${renderImportedAssetDeleteModal(ui)}
    </section>
  `;
}

function renderProjectEpisodesInterior({ state, ui }) {
  const episodes = getEpisodeHubEntries(state, ui);
  return renderEpisodeHub({ episodes, ui });
}

function renderProjectMembersInterior(ui) {
  const members = Array.isArray(ui.projectMembers) ? ui.projectMembers : [];
  return `
    <section class="project-info-panel" aria-label="成员">
      <header class="project-info-header">
        <h1>成员</h1>
        <p>当前项目所在协作空间的真实成员列表。</p>
      </header>
      <div class="project-info-grid">
        ${
          members.length
            ? members
                .map(
                  (member) => `
                    <article class="project-info-card member-card">
                      <strong>${escapeHtml(member.phone ?? member.userId ?? "未命名成员")}</strong>
                      <span>角色：${escapeHtml(member.role ?? "unknown")}</span>
                      <span>状态：${escapeHtml(member.status ?? "unknown")}</span>
                    </article>
                  `,
                )
                .join("")
            : '<article class="project-info-card empty"><strong>暂无成员数据</strong><span>当前项目尚未返回可展示的成员信息。</span></article>'
        }
      </div>
    </section>
  `;
}

function renderProjectStatsInterior(ui) {
  const stats = ui.projectStats ?? null;
  const exportHistory = ui.exportHistory ?? [];
  return `
    <section class="project-info-panel" aria-label="统计">
      <header class="project-info-header">
        <h1>统计</h1>
        <p>聚合当前项目的剧集、分镜、资产与导出记录。</p>
      </header>
      <div class="project-stats-grid">
        ${renderProjectStatMetric("成员", stats?.memberCount ?? 0)}
        ${renderProjectStatMetric("剧集", stats?.episodeCount ?? 0)}
        ${renderProjectStatMetric("分镜", stats?.shotCount ?? 0)}
        ${renderProjectStatMetric("资产", stats?.assetCount ?? 0)}
        ${renderProjectStatMetric("导出", stats?.exportCount ?? 0)}
        ${renderProjectStatMetric("图片生成", stats?.generatedImageCount ?? 0)}
        ${renderProjectStatMetric("视频生成", stats?.generatedVideoCount ?? 0)}
      </div>
      <section class="project-export-history-panel">
        <div class="project-info-header compact">
          <h2>导出历史</h2>
          <p>显示当前项目最近的真实导出记录。</p>
        </div>
        <div class="project-export-history-list">
          ${
            exportHistory.length
              ? exportHistory
                  .map(
                    (record) => `
                      <article class="project-info-card export-card">
                        <strong>${escapeHtml(record.workflowId ?? record.id ?? "导出记录")}</strong>
                        <span>状态：${escapeHtml(record.manifestStatus ?? "unknown")}</span>
                        <span>时间：${escapeHtml(formatEpisodeHubDate(record.createdAt ?? Date.now()))}</span>
                      </article>
                    `,
                  )
                  .join("")
              : '<article class="project-info-card empty"><strong>暂无导出记录</strong><span>当项目发生导出后，会在这里展示真实历史。</span></article>'
          }
        </div>
      </section>
    </section>
  `;
}

function renderProjectStatMetric(label, value) {
  return `
    <article class="project-info-card stat-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
    </article>
  `;
}

function renderProjectOverviewInterior({ state, ui, detailState, aspectRatio, hasAssets, episodeCount }) {
  const episodes = getEpisodeHubEntries(state, ui);
  const hasEpisodes = episodes.length > 0;
  const primaryEpisodeTitle = episodes[0]?.title || detailState.episodes?.[0]?.title || "剧一";
  return `
    <section class="project-settings-panel">
      <header class="settings-header">
        <button class="settings-title-button" type="button">设置 <span aria-hidden="true">⌄</span></button>
        <div class="settings-chips">
          <span>2D/3D 动漫</span>
          <span class="ratio-chip"><i aria-hidden="true"></i>${escapeHtml(aspectRatio)}</span>
          <span>无风格，无题材</span>
          <button type="button" data-action="open-script-modal">上传剧本/分镜单</button>
        </div>
      </header>

      <section id="asset-prep-section" class="interior-section asset-prep-section" aria-label="资产准备">
        <div class="interior-section-title">
          <h2>资产准备</h2>
          <button class="asset-ai-button" type="button" data-action="open-script-modal">
            <span class="free-ribbon">首次免费</span>
            ✦ AI 智能提取资产
          </button>
          <button class="sr-only-action" type="button" data-action="confirm-all-assets" ${disabled(!state.assetCandidates || ui.busy)}>确认全部资产</button>
        </div>
        <div class="asset-prep-grid">
          ${renderInteriorAssetCard("角色", "character", "violet", detailState.assets.characters, detailState.assets.previews?.character)}
          ${renderInteriorAssetCard("场景", "scene", "teal", detailState.assets.scenes, detailState.assets.previews?.scene)}
          ${renderInteriorAssetCard("道具", "prop", "ochre", detailState.assets.props, detailState.assets.previews?.prop)}
          ${renderInteriorAssetCard("其它", "other", "cyan", detailState.assets.others, detailState.assets.previews?.other)}
        </div>
      </section>

      <section class="interior-section episode-creation-section" aria-label="剧集创作">
        <div class="interior-section-title episode-section-header">
          <button
            class="episode-section-title"
            type="button"
            data-action="set-project-interior-section"
            data-section="episodes"
          >
            剧集创作 <span aria-hidden="true">→</span>
          </button>
          <span class="episode-section-name">${escapeHtml(hasEpisodes ? primaryEpisodeTitle : "从这里开始创建第一集")}</span>
        </div>
        ${
          hasEpisodes
            ? renderOverviewEpisodePanel({ episodes, ui })
            : `
                <div class="episode-empty-canvas">
                  <div class="episode-canvas-glow"></div>
                  <div class="episode-canvas-copy always-visible">
                    <strong>从这里开始创建第一集</strong>
                    <span>
                      从 <button type="button" class="episode-inline-link" data-action="open-single-episode-flow">单集创建</button>
                      或 <button type="button" class="episode-inline-link" data-action="open-batch-episode-flow">AI 批量创建</button>
                    </span>
                  </div>
                </div>
              `
        }
      </section>
    </section>
  `;
}

function renderOverviewEpisodePanel({ episodes = [], ui }) {
  return `
    <div class="episode-overview-canvas" aria-label="总览剧集列表">
      <div class="episode-overview-list">
        ${episodes.map((episode) => renderEpisodeHubCard(episode, ui)).join("")}
      </div>
    </div>
  `;
}

function renderEpisodeCreationHub(ui) {
  return `
    <section class="episode-hub-shell empty" aria-label="剧集菜单">
      <header class="episode-hub-header">
        <div class="episode-hub-tabs">
          <strong>剧集 (0)</strong>
          <button class="episode-history-tab" type="button" data-action="open-episode-export-history">导出历史</button>
        </div>
      </header>

      <div class="episode-hub-cards">
        <article class="episode-launch-card ai" data-action="open-batch-episode-flow">
          <div class="episode-launch-copy">
            <h2>AI 批量创建分集 <span class="launch-badge">首次免费</span></h2>
            <p>从剧本批量创建分集，快速搭建整部漫画的剧集内容。</p>
            <button class="episode-launch-button primary" type="button" data-action="open-batch-episode-flow">
              <span aria-hidden="true">✦</span>
              AI 批量创建分集
            </button>
          </div>
          <div class="episode-launch-art collage" aria-hidden="true"></div>
        </article>

        <article class="episode-launch-card single" data-action="open-single-episode-flow">
          <div class="episode-launch-copy">
            <h2>单集创建</h2>
            <p>手动创建单集文件，先搭建目录，再补充分镜和生成内容。</p>
            <button class="episode-launch-button" type="button" data-action="open-single-episode-flow">
              <span aria-hidden="true">⊕</span>
              单集创建
            </button>
          </div>
          <div class="episode-launch-art corridor" aria-hidden="true"></div>
        </article>
      </div>
    </section>
  `;
}

function renderEpisodeHub({ episodes = [], ui }) {
  if (!episodes.length) {
    return renderEpisodeCreationHub(ui);
  }

  return `
    <section class="episode-hub-shell populated" aria-label="剧集菜单">
      <header class="episode-hub-header">
        <div class="episode-hub-tabs">
          <strong>剧集 (${episodes.length})</strong>
          <button class="episode-history-tab" type="button" data-action="open-episode-export-history">导出历史</button>
        </div>
      </header>

      <div class="episode-hub-grid">
        <div class="episode-hub-launches">
          <article class="episode-launch-card ai" data-action="open-batch-episode-flow">
            <div class="episode-launch-copy">
              <h2>AI 批量创建分集 <span class="launch-badge">首次免费</span></h2>
              <p>从剧本批量创建分集，快速搭建整部漫画的剧集内容。</p>
              <button class="episode-launch-button primary" type="button" data-action="open-batch-episode-flow">
                <span aria-hidden="true">✦</span>
                AI 批量创建分集
              </button>
            </div>
            <div class="episode-launch-art collage" aria-hidden="true"></div>
          </article>

          <article class="episode-launch-card single" data-action="open-single-episode-flow">
            <div class="episode-launch-copy">
              <h2>单集创建</h2>
              <p>手动创建单集文件，先搭建目录，再补充分镜和生成内容。</p>
              <button class="episode-launch-button" type="button" data-action="open-single-episode-flow">
                <span aria-hidden="true">⊕</span>
                单集创建
              </button>
            </div>
            <div class="episode-launch-art corridor" aria-hidden="true"></div>
          </article>
        </div>

        <div class="episode-hub-list" aria-label="剧集列表">
          ${episodes.map((episode) => renderEpisodeHubCard(episode, ui)).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderEpisodeHubCard(episode, ui) {
  const isMenuOpen = ui.episodeCardMenuId === episode.id;
  return `
    <article class="episode-card episode-library-card" data-action="open-episode-workbench" data-episode-id="${escapeHtml(episode.id)}">
      <div class="episode-card-preview ${episode.previewMedia?.kind === "video" ? "has-video-preview" : ""}" aria-hidden="true">
        ${
          episode.previewMedia?.src
            ? episode.previewMedia.kind === "video"
              ? `<video src="${escapeAttr(episode.previewMedia.src)}" muted playsinline preload="metadata"></video><i>▶</i>`
              : `<img src="${escapeAttr(episode.previewMedia.src)}" alt="" />`
            : "<span>剧</span>"
        }
      </div>
      <div class="episode-card-body">
        <div class="episode-card-copy">
          <h3 title="${escapeHtml(episode.title)}">${escapeHtml(truncateEpisodeTitle(episode.title))}</h3>
          <p>${escapeHtml(formatEpisodeHubDate(episode.createdAt ?? "2026/05/22"))}</p>
        </div>
        <div class="episode-card-actions">
          <button
            class="episode-card-menu-button"
            type="button"
            data-action="toggle-episode-card-menu"
            data-episode-id="${escapeHtml(episode.id)}"
            aria-expanded="${isMenuOpen ? "true" : "false"}"
            aria-label="剧集菜单"
          >
            ⋯          </button>
          ${isMenuOpen ? renderEpisodeHubMenu(episode) : ""}
        </div>
      </div>
    </article>
  `;
}

function renderEpisodeHubMenu(episode) {
  return `
    <div class="episode-card-menu" role="menu" aria-label="剧集操作">
      <button class="episode-card-menu-item" type="button" data-action="rename-episode-card" data-episode-id="${escapeHtml(episode.id)}">重命名</button>
      <button class="episode-card-menu-item danger" type="button" data-action="delete-episode-card" data-episode-id="${escapeHtml(episode.id)}">删除</button>
    </div>
  `;
}

function renderSingleEpisodeModal(ui) {
  const activeLookPanel = normalizeOpenSingleEpisodeLookType(ui.singleEpisodeLookPanel);
  const selectedPackageIds = normalizeSingleEpisodeLookSelections(ui.selectedSingleEpisodeLookPackageIds);
  const packages = normalizeStoryboardPromptPackages(ui.storyboardPromptPackages);
  return `
    <section class="modal-backdrop" role="dialog" aria-modal="true" aria-label="新建剧集">
      <div class="single-episode-modal single-episode-studio">
        <div class="single-episode-modal-head">
          <div class="single-episode-modal-heading">
            <p>Single Episode</p>
            <h2>请输入您的剧本开始创作</h2>
          </div>
          <button class="modal-close" type="button" data-action="close-single-episode-modal" aria-label="关闭">×</button>
        </div>
        <p class="single-episode-lead">从一句设定、一段对白或完整剧情开始，我们会为你生成新的单集创作工作台。</p>
        <label class="single-episode-field single-episode-script-field">
          <textarea id="single-episode-script-input" placeholder="例如：深夜暴雨中，女主在便利店门口第一次遇见失忆的男主，空气里有霓虹反光和一点危险感。">${escapeHtml(ui.singleEpisodeScript ?? "")}</textarea>
          <span class="single-episode-count">${[...(ui.singleEpisodeScript ?? "")].length}/5000</span>
        </label>
        <div class="single-episode-toolbar single-episode-toolbar-replica">
          <div class="single-episode-toolbar-left">
            <div class="single-episode-look-controls">
              ${SINGLE_EPISODE_LOOK_TYPES
                .map((option) => renderSingleEpisodeLookSelect({
                  option,
                  activeType: activeLookPanel,
                  packages,
                  selectedPackageIds,
                }))
                .join("")}
            </div>
            </div>
          <div class="single-episode-actions">
            <button class="single-episode-ghost-action" type="button" data-action="create-empty-single-episode">创建空白章节</button>
            <button class="primary-action single-episode-ai-action" type="button" data-action="confirm-single-episode">AI 智能分镜</button>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderSingleEpisodeAiPreview(ui) {
  const preview = ui.singleEpisodeAiPreview ?? { status: "idle", data: null, error: "" };
  if (!preview || preview.status === "idle") {
    return "";
  }
  if (preview.source === "manual-script-analysis") {
    return renderManualScriptAnalysisPreview(preview);
  }
  if (preview.status === "loading") {
    return `
      <section class="single-episode-ai-overlay" role="dialog" aria-modal="true" aria-label="AI 智能分镜">
        <div class="single-episode-ai-overlay-top">
          <button class="single-episode-ai-back" type="button" data-action="close-ai-storyboard-preview">‹ 返回</button>
          <div class="single-episode-ai-top-status" aria-live="polite">
            <p>AI Storyboard</p>
            <h3>${resolveSingleEpisodeAiLoadingTitle(preview.activeStage)}</h3>
          </div>
          <div class="single-episode-ai-overlay-actions">
            <button class="single-episode-ai-create" type="button" disabled>创建章节</button>
            <button class="single-episode-ai-close" type="button" data-action="close-ai-storyboard-preview" aria-label="关闭">×</button>
          </div>
        </div>
        <div class="single-episode-ai-loading-bar"><span></span></div>
        <div class="single-episode-ai-preview loading" aria-live="polite">
          ${renderSingleEpisodeAiLiveOutput(preview)}
          ${renderSingleEpisodeAiLiveTables(preview)}
        </div>
      </section>
    `;
  }
  if (preview.status === "error") {
    return `
      <section class="single-episode-ai-overlay" role="dialog" aria-modal="true" aria-label="AI 智能分镜生成失败">
        <div class="single-episode-ai-overlay-top">
          <button class="single-episode-ai-back" type="button" data-action="close-ai-storyboard-preview">‹ 返回</button>
          <div class="single-episode-ai-overlay-actions">
            <button class="single-episode-ai-close" type="button" data-action="close-ai-storyboard-preview" aria-label="关闭">×</button>
          </div>
        </div>
        <div class="single-episode-ai-preview error" aria-live="polite">
          <div class="single-episode-ai-preview-head">
            <div>
              <p>AI Storyboard</p>
              <h3>生成失败</h3>
            </div>
          </div>
          <p class="single-episode-ai-error">${escapeHtml(preview.error || "请稍后重试")}</p>
        </div>
      </section>
    `;
  }
  const previewPayload = preview.data?.displayTables ? preview.data : preview;
  const tables = previewPayload?.displayTables ?? {};
  return `
    <section class="single-episode-ai-overlay" role="dialog" aria-modal="true" aria-label="AI 智能分镜结果">
      <div class="single-episode-ai-overlay-top">
        <button class="single-episode-ai-back" type="button" data-action="close-ai-storyboard-preview">‹ 返回</button>
        <div class="single-episode-ai-overlay-actions">
          <button class="single-episode-ai-create" type="button" data-action="commit-ai-storyboard-preview">创建章节</button>
          <button class="single-episode-ai-close" type="button" data-action="close-ai-storyboard-preview" aria-label="关闭">×</button>
        </div>
      </div>
      <div class="single-episode-ai-preview ready">
        <div class="single-episode-ai-preview-head">
          <div>
          <p>AI Storyboard</p>
          <h3>AI智能分镜</h3>
        </div>
        </div>
        <div class="single-episode-ai-table-stack">
          ${["script", "characters", "scenes", "props", "storyboards"]
            .map((key) => renderSingleEpisodeAiTable(tables[key], key))
            .join("")}
        </div>
      </div>
    </section>
  `;
}

function renderManualScriptAnalysisPreview(preview) {
  const isLoading = preview.status === "loading";
  const isError = preview.status === "error";
  const title = isError ? "分析失败" : isLoading ? "DeepSeek 正在分析剧本" : "DeepSeek 剧本分析结果";
  const saveDisabled = isLoading || isError || !resolveManualScriptAnalysisText(preview).trim();
  return `
    <section class="single-episode-ai-overlay manual-script-analysis-overlay" role="dialog" aria-modal="true" aria-label="DeepSeek 剧本分析">
      <div class="single-episode-ai-overlay-top manual-script-analysis-top">
        <button class="single-episode-ai-back" type="button" data-action="close-ai-storyboard-preview">‹ 返回</button>
        <div class="single-episode-ai-top-status" aria-live="polite">
          <p>DeepSeek Script</p>
          <h3>${escapeHtml(title)}</h3>
        </div>
        <div class="single-episode-ai-overlay-actions">
          <button
            class="single-episode-ai-create manual-script-analysis-save"
            type="button"
            data-action="save-manual-script-analysis"
            ${saveDisabled ? "disabled" : ""}
          >保存剧本</button>
          <button
            class="single-episode-ai-create manual-script-analysis-regenerate"
            type="button"
            data-action="regenerate-manual-script-analysis"
            ${isLoading ? "disabled" : ""}
          >重新生成</button>
          <button class="single-episode-ai-close" type="button" data-action="close-ai-storyboard-preview" aria-label="关闭">×</button>
        </div>
      </div>
      ${isLoading ? `<div class="single-episode-ai-loading-bar"><span></span></div>` : ""}
      <div class="single-episode-ai-preview manual-script-analysis-preview ${escapeAttr(preview.status)}" aria-live="polite">
        ${isError
          ? `<p class="single-episode-ai-error">${escapeHtml(preview.error || "请稍后重试")}</p>`
          : renderManualScriptAnalysisOutput(preview)}
      </div>
    </section>
  `;
}

function renderManualScriptAnalysisOutput(preview) {
  const text = formatSingleEpisodeAiLiveText(resolveManualScriptAnalysisText(preview), { maxChars: 30000 });
  return `
    <article class="manual-script-analysis-output">
      <header>
        <strong>剧本</strong>
        <span>${preview.status === "loading" ? "实时返回中" : "已完成"}</span>
      </header>
      <pre>${escapeHtml(text || "等待 DeepSeek 返回剧本内容...")}</pre>
    </article>
  `;
}

function resolveManualScriptAnalysisText(preview) {
  return String(
    preview?.scriptRawText ||
    preview?.scriptText ||
    preview?.data?.scriptText ||
    "",
  );
}

function resolveSingleEpisodeAiLoadingTitle(stage) {
  const normalized = String(stage ?? "");
  if (normalized === "scene") return "场景提示词生成中";
  if (normalized === "character") return "角色提示词生成中";
  if (normalized === "prop") return "道具提示词生成中";
  if (normalized === "shot" || normalized === "prompt") return "分镜提示词生成中";
  if (normalized === "complete") return "列表化数据生成中";
  return "剧本生成中";
}

function renderSingleEpisodeAiLiveOutput(preview) {
  const liveOutput = resolveSingleEpisodeAiLiveOutput(preview);
  return `
    <article class="single-episode-ai-live-output">
      <header>
        <strong>${escapeHtml(liveOutput.title)}</strong>
        <span>实时回显</span>
      </header>
      <pre>${escapeHtml(formatSingleEpisodeAiLiveText(liveOutput.text, { maxChars: 12000 }) || liveOutput.emptyText)}</pre>
    </article>
  `;
}

function formatSingleEpisodeAiLiveText(rawText, options = {}) {
  const maxChars = Number(options.maxChars ?? 0);
  const raw = truncateSingleEpisodeAiPreviewText(String(rawText ?? ""), maxChars);
  if (!raw.trim()) {
    return "";
  }

  try {
    const parsed = JSON.parse(raw);
    const values = [];
    collectSingleEpisodeAiLiveValues(parsed, values);
    return values.join("\n").trim();
  } catch {
    return raw
      .replace(/\\n/g, "\n")
      .replace(/"[^"]+"\s*:/g, "")
      .replace(/[{}\[\],]/g, "\n")
      .replace(/^["\s]+|["\s]+$/gm, "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n");
  }
}

function truncateSingleEpisodeAiPreviewText(value, maxChars = 0) {
  const text = String(value ?? "");
  if (!maxChars || text.length <= maxChars) {
    return text;
  }
  return `…已截断，仅展示最近 ${maxChars} 字符…\n${text.slice(-maxChars)}`;
}

function collectSingleEpisodeAiLiveValues(value, output) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectSingleEpisodeAiLiveValues(item, output));
    return;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => {
      if (/id$/i.test(key)) {
        return;
      }
      collectSingleEpisodeAiLiveValues(item, output);
    });
    return;
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (text) {
      output.push(text);
    }
    return;
  }
  if (typeof value === "number") {
    output.push(String(value));
  }
}

function resolveSingleEpisodeAiLiveOutput(preview) {
  const stage = String(preview?.activeStage ?? "script");
  const stageConfig = {
    script: { label: "剧本", empty: "等待 DeepSeek 返回剧本数据..." },
    scene: { label: "场景", empty: "等待 DeepSeek 返回场景数据..." },
    character: { label: "角色", empty: "等待 DeepSeek 返回角色数据..." },
    prop: { label: "道具", empty: "等待 DeepSeek 返回道具数据..." },
    shot: { label: "分镜", empty: "等待 DeepSeek 返回分镜数据..." },
    prompt: { label: "分镜", empty: "等待 DeepSeek 返回分镜数据..." },
  };
  const config = stageConfig[stage] ?? stageConfig.script;
  if (stage === "script") {
    return {
      title: `DeepSeek ${config.label}实时返回`,
      text: String(preview?.scriptRawText ?? preview?.scriptText ?? ""),
      emptyText: config.empty,
    };
  }
  const assetStage = stage === "prompt" ? "shot" : stage;
  const step = Array.isArray(preview?.assetPromptSteps)
    ? preview.assetPromptSteps.find((item) => String(item?.stage ?? "") === assetStage)
    : null;
  return {
    title: `DeepSeek ${config.label}实时返回`,
    text: String(step?.responseText ?? step?.rawResponseText ?? ""),
    emptyText: config.empty,
  };
}

function renderSingleEpisodeAiLiveTables(preview) {
  const tables = preview?.data?.displayTables ?? preview?.displayTables ?? {};
  return `
    <div class="single-episode-ai-table-stack live">
      ${["script", "characters", "scenes", "props", "storyboards"]
        .map((key) => renderSingleEpisodeAiTable(tables[key], key, { previewMode: "live" }))
        .join("")}
    </div>
  `;
}

function renderSingleEpisodeAiTable(table, key, options = {}) {
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  const visibleRows = options.previewMode === "live" ? rows.slice(0, 8) : rows;
  const hiddenRowCount = rows.length - visibleRows.length;
  const title = table?.title ?? AI_PREVIEW_TABLE_TITLES[key] ?? "结果";
  const columns = resolveSingleEpisodeAiTableColumns(table, key);
  if (key === "script") {
    return renderSingleEpisodeAiScriptText(table);
  }
  return `
    <article class="single-episode-ai-table-card ${escapeAttr(key)}">
      <header>
        <strong>${escapeHtml(title)}</strong>
        <span>${rows.length} 条</span>
      </header>
      <div class="single-episode-ai-table-wrap">
        <table>
          <thead>
            <tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${
              visibleRows.length
                ? visibleRows.map((row) => renderSingleEpisodeAiTableRow(row, key, columns, options)).join("")
                : `<tr><td colspan="${Math.max(columns.length, 1)}">暂无数据</td></tr>`
            }
            ${hiddenRowCount > 0 ? `<tr><td colspan="${Math.max(columns.length, 1)}">实时预览仅展示前 ${visibleRows.length} 条，完整结果生成后显示。</td></tr>` : ""}
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function resolveSingleEpisodeAiTableColumns(table, key) {
  if (key === "storyboards" && Array.isArray(table?.columns) && table.columns.length) {
    return table.columns;
  }
  const fixedColumns = {
    characters: ["角色名称（角色名称/服装描述）", "角色描述（仅含年龄、国籍、性别、服装、脸部特征、细节特征）"],
    scenes: ["场景名称（角色名称/天气和时间描述）", "场景描述（仅含空间结构、建筑风格、建筑细节、光影规则、氛围基调、关键道具）"],
    props: ["道具名称", "道具描述（仅含外观、颜色、细节特征）"],
    storyboards: ["镜号", "分镜剧情", "对话/旁白", "时长", "时间段", "转场", "景别/运镜", "静态图片提示词", "动态视频提示词（多镜头序列，每一分镜镜头总时长≤15s）", "分镜详细字段"],
  };
  if (fixedColumns[key]) {
    return fixedColumns[key];
  }
  return Array.isArray(table?.columns) ? table.columns : [];
}

function renderSingleEpisodeAiScriptText(table) {
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  const text = rows
    .map((row) => [row.scriptContent, row.dialogue].filter(Boolean).join("\n"))
    .filter(Boolean)
    .join("\n\n");
  return `
    <article class="single-episode-ai-script-text">
      <header>
        <strong>${escapeHtml(table?.title ?? "剧本")}</strong>
        <span>${rows.length} 段</span>
      </header>
      <div>${escapeHtml(text || "暂无剧本文字")}</div>
    </article>
  `;
}

function renderSingleEpisodeAiTableRow(row, key, columns = [], options = {}) {
  const chapterStoryboardColumns = ["分镜剧情", "对话/旁白", "静态图片提示词", "动态视频提示词"];
  const valuesByKey = {
    script: [row.beatNo, row.scriptContent, row.characters, row.sceneHint, row.propHints, row.dialogue],
    scenes: [row.sceneName, row.sceneDescription],
    characters: [row.characterName, row.characterDescription],
    props: [row.propName, row.propDescription],
    storyboards: columns.length === chapterStoryboardColumns.length && columns.every((column, index) => column === chapterStoryboardColumns[index])
      ? [row.plot, row.dialogue, row.imagePrompt, row.videoPrompt]
      : [row.shotNo, row.plot, row.dialogue, row.durationSec, row.timeRange, row.transition, row.shotDirection, row.imagePrompt, row.videoPrompt, row.shotDetails],
  };
  const values = valuesByKey[key] ?? Object.values(row ?? {});
  const maxCellChars = options.previewMode === "live" ? 900 : 0;
  return `<tr>${values.map((value) => `<td>${escapeHtml(truncateSingleEpisodeAiPreviewText(value ?? "", maxCellChars))}</td>`).join("")}</tr>`;
}

const AI_PREVIEW_TABLE_TITLES = {
  script: "剧本",
  scenes: "场景",
  characters: "角色",
  props: "道具",
  storyboards: "分镜",
};

const SINGLE_EPISODE_LOOK_TYPES = [
  { type: "genre", label: "题材看点", title: "题材", empty: "暂无启用的题材包", limit: 3 },
  { type: "emotion", label: "情绪看点", title: "情绪", empty: "暂无启用的情绪包", limit: 3 },
];

function renderScriptManualLookControls(ui = {}) {
  const activeLookPanel = normalizeOpenSingleEpisodeLookType(ui.singleEpisodeLookPanel);
  const selectedPackageIds = normalizeSingleEpisodeLookSelections(ui.selectedSingleEpisodeLookPackageIds);
  const packages = normalizeStoryboardPromptPackages(ui.storyboardPromptPackages);
  const manualOptions = SINGLE_EPISODE_LOOK_TYPES.map((option) => ({
    ...option,
    label: option.type === "genre" ? "题材包" : "情绪包",
  }));
  return `
    <div class="single-episode-look-controls script-manual-look-control-row">
      ${manualOptions
        .map((option) => renderSingleEpisodeLookSelect({
          option,
          activeType: activeLookPanel,
          packages,
          selectedPackageIds,
        }))
        .join("")}
    </div>
  `;
}

function renderSingleEpisodeLookSelect({ option, activeType, packages = [], selectedPackageIds = {} }) {
  const type = option.type;
  const isOpen = activeType === type;
  const selectedIds = new Set(selectedPackageIds[type] ?? []);
  const items = packages
    .filter((item) => resolvePackageType(item) === type && item.status !== "disabled")
    .slice(0, 48);
  const summary = resolveSingleEpisodeLookSummary(items, selectedIds);

  return `
    <section class="single-episode-look-select ${isOpen ? "open" : ""}" aria-label="${escapeAttr(option.label)}">
      <div class="single-episode-look-label">
        <span>${escapeHtml(option.label)}</span>
        <i aria-hidden="true">?</i>
      </div>
      <button
        class="single-episode-look-trigger"
        type="button"
        data-action="toggle-single-episode-look-panel"
        data-look-type="${escapeAttr(type)}"
        aria-expanded="${isOpen ? "true" : "false"}"
      >
        <span title="${escapeAttr(summary)}">${escapeHtml(summary)}</span>
        <b aria-hidden="true">${isOpen ? "⌃" : "⌄"}</b>
      </button>
      ${isOpen ? renderSingleEpisodeLookDropdown({ option, items, selectedIds }) : ""}
    </section>
  `;
}

function renderSingleEpisodeLookDropdown({ option, items, selectedIds }) {
  const type = option.type;
  return `
    <div class="single-episode-look-dropdown" role="listbox" aria-label="${escapeAttr(option.title)}">
      <header>
        <strong>${escapeHtml(option.title)}</strong>
      </header>
      <div class="single-episode-look-grid">
        <button
          class="single-episode-look-chip ${selectedIds.size === 0 ? "active" : ""}"
          type="button"
          data-action="toggle-single-episode-look-package"
          data-look-type="${escapeAttr(type)}"
          data-package-id="auto"
          aria-pressed="${selectedIds.size === 0 ? "true" : "false"}"
        >
          自动适配
        </button>
        ${
          items.length
            ? items.map((item) => {
              const selected = selectedIds.has(item.id);
              return `
                <button
                  class="single-episode-look-chip ${selected ? "active" : ""}"
                  type="button"
                  data-action="toggle-single-episode-look-package"
                  data-look-type="${escapeAttr(type)}"
                  data-package-id="${escapeAttr(item.id)}"
                  aria-pressed="${selected ? "true" : "false"}"
                >
                  ${escapeHtml(item.name)}
                </button>
              `;
            }).join("")
            : `<p class="single-episode-look-empty">${escapeHtml(option.empty)}</p>`
        }
      </div>
    </div>
  `;
}

function resolveSingleEpisodeLookSummary(items, selectedIds) {
  const names = items
    .filter((item) => selectedIds.has(item.id))
    .map((item) => item.name)
    .filter(Boolean);
  return names.length ? names.join("，") : "自动适配，自动适配";
}

function normalizeOpenSingleEpisodeLookType(value) {
  return SINGLE_EPISODE_LOOK_TYPES.some((item) => item.type === value) ? value : "";
}

function normalizeSingleEpisodeLookSelections(value = {}) {
  return {
    genre: Array.isArray(value.genre) ? value.genre.map(String) : [],
    emotion: Array.isArray(value.emotion) ? value.emotion.map(String) : [],
  };
}

function normalizeStoryboardPromptPackages(packages = []) {
  return Array.isArray(packages)
    ? packages
        .filter((item) => item && typeof item === "object")
        .map((item) => ({
          id: String(item.id ?? item.code ?? item.name ?? ""),
          name: String(item.name ?? item.label ?? item.code ?? ""),
          package_type: String(item.package_type ?? item.packageType ?? ""),
          status: String(item.status ?? "enabled"),
        }))
        .filter((item) => item.id && item.name)
    : [];
}

function resolvePackageType(item) {
  return String(item?.package_type ?? item?.packageType ?? "");
}

function getEpisodeHubEntries(state, ui) {
  if (Array.isArray(state?.projectDetail?.episodes)) {
    const detailEpisodes = state.projectDetail.episodes.map((episode) => ({
      id: episode.id,
      title: episode.title,
      sequence: Number(episode.sequence ?? 0),
      status: episode.status === "ready" ? "已定稿" : "未定稿",
      createdAt: episode.createdAt ?? "2026/05/22",
      createdAtMs: getEpisodeCreatedAtValue(episode.createdAt),
      storyboardCount: episode.storyboardCount ?? 0,
      previewMedia: getEpisodePreviewMedia(episode.id, ui, episode.previewUrl ?? null),
    }));
    const primaryEpisode = buildPrimaryEpisodeEntry(state, ui);
    const mergedEpisodes = primaryEpisode
      ? [primaryEpisode, ...detailEpisodes.filter((episode) => episode.id !== primaryEpisode.id)]
      : detailEpisodes;
    return sortEpisodeEntriesByLatest(mergedEpisodes);
  }
  const derivedEpisodes = state?.shots?.length
    ? [
        {
          id: "episode-primary",
          title: "剧一",
          sequence: 0,
          status: "未定稿",
          createdAt: "2026/05/22",
          createdAtMs: getEpisodeCreatedAtValue("2026/05/22"),
          storyboardCount: state.shots.length,
          previewMedia: getEpisodePreviewMedia("episode-primary", ui, null),
        },
      ]
    : [];
  const customEpisodes = Array.isArray(ui.customEpisodes)
    ? ui.customEpisodes.map((episode) => ({
        ...episode,
        previewMedia: getEpisodePreviewMedia(
          episode.id,
          ui,
          episode.previewMedia?.src ?? episode.previewUrl ?? null,
        ),
      }))
    : [];

  return sortEpisodeEntriesByLatest([...customEpisodes, ...derivedEpisodes]);
}

  function buildPrimaryEpisodeEntry(state, ui) {
  const shots = Array.isArray(state?.projectDetail?.shots)
    ? state.projectDetail.shots
    : (Array.isArray(state?.shots) ? state.shots : []);
  const unassignedShots = shots.filter((shot) => !shot?.episodeId);
  if (!unassignedShots.length) {
    return null;
  }

    const episodes = Array.isArray(state?.projectDetail?.episodes) ? state.projectDetail.episodes : [];
    if (episodes.length > 0) {
      return null;
    }
    if (episodes.some((episode) => episode?.id === "episode-primary")) {
      return null;
    }

  const primaryCreatedAt = state?.projectDetail?.project?.createdAt ?? state?.project?.createdAt ?? "2026/05/22";

  return {
    id: "episode-primary",
    title: "剧一",
    sequence: 0,
    status: "未定稿",
    createdAt: primaryCreatedAt,
    createdAtMs: getEpisodeCreatedAtValue(primaryCreatedAt),
    storyboardCount: unassignedShots.length,
    previewMedia: getEpisodePreviewMedia("episode-primary", ui, null),
  };
}

function sortEpisodeEntriesByLatest(episodes) {
  return [...episodes].sort((left, right) => {
    const timeDelta =
      getEpisodeCreatedAtValue(right.createdAtMs ?? right.createdAt) -
      getEpisodeCreatedAtValue(left.createdAtMs ?? left.createdAt);
    if (timeDelta !== 0) {
      return timeDelta;
    }
    const sequenceDelta = Number(right.sequence ?? 0) - Number(left.sequence ?? 0);
    if (sequenceDelta !== 0) {
      return sequenceDelta;
    }
    return String(right.id ?? "").localeCompare(String(left.id ?? ""), "zh-CN-u-kn-true");
  });
}

function getEpisodeCreatedAtValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value.replace(/\./g, "/"));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function getEpisodePreviewMedia(episodeId, ui, fallbackSource) {
  const storyboards = getEpisodePreviewStoryboards(episodeId, ui);
  const firstVideoStoryboard = storyboards.find((storyboard) => getStoryboardVideoSource(storyboard));

  if (firstVideoStoryboard) {
    return {
      kind: "video",
      src: getStoryboardVideoSource(firstVideoStoryboard),
    };
  }

  if (fallbackSource) {
    return {
      kind: isVideoSource(fallbackSource) ? "video" : "image",
      src: fallbackSource,
    };
  }

  return null;
}

function getEpisodePreviewStoryboards(episodeId, ui) {
  if (episodeId === "episode-primary") {
    return Array.isArray(ui.storyboards) ? ui.storyboards : [];
  }
  if (!episodeId) {
    return [];
  }
  return Array.isArray(ui.episodeStoryboardMap?.[episodeId]) ? ui.episodeStoryboardMap[episodeId] : [];
}

function getStoryboardVideoSource(storyboard) {
  if (!storyboard) {
    return "";
  }

  if (storyboard.previewVideo) {
    return storyboard.previewVideo;
  }

  const selectedUploadedVideo = (storyboard.uploadedVideos ?? []).find(
    (video) => video.id === storyboard.selectedUploadedVideoId && video.status === "ready" && video.src,
  );
  if (selectedUploadedVideo?.src) {
    return selectedUploadedVideo.src;
  }

  const firstUploadedVideo = (storyboard.uploadedVideos ?? []).find(
    (video) => video.status === "ready" && video.src,
  );
  if (firstUploadedVideo?.src) {
    return firstUploadedVideo.src;
  }

  return isVideoSource(storyboard.previewUrl) ? storyboard.previewUrl : "";
}

function isVideoSource(value) {
  return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(String(value ?? ""));
}

function formatEpisodeHubDate(value) {
  const createdAtMs = getEpisodeCreatedAtValue(value);
  if (!createdAtMs) {
    return "2026/05/22";
  }
  const date = new Date(createdAtMs);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

function truncateEpisodeTitle(value, maxLength = 10) {
  const title = String(value ?? "");
  return [...title].length > maxLength ? `${[...title].slice(0, maxLength).join("")}...` : title;
}

function renderInteriorNavItem(item, active = false) {
  return `
    <button
      class="interior-nav-item ${active ? "active" : ""}"
      type="button"
      data-action="set-project-interior-section"
      data-section="${escapeHtml(item.id)}"
    >
      <span aria-hidden="true">${item.icon}</span>
      <strong>${escapeHtml(item.label)}</strong>
    </button>
  `;
}

function renderProjectInteriorStatusMenu(currentStatus) {
  return `
    <div class="project-interior-status-menu" role="menu" aria-label="修改项目制作状态">
      <p>修改项目制作状态</p>
      ${["制作中", "一稿交付", "完结"]
        .map((status) => {
          const isActive = normalizeProjectStatus(status) === currentStatus;
          return `
            <button
              class="project-interior-status-option ${isActive ? "active" : ""}"
              type="button"
              data-action="set-project-interior-status"
              data-status="${escapeHtml(status)}"
            >
              <span class="status-dot ${getStatusTone(status)}" aria-hidden="true"></span>
              ${escapeHtml(status)}
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderProjectAssetLibrary({ state, ui, activeAssetTab }) {
  const tab = ASSET_TABS.find((item) => item.id === activeAssetTab) ?? ASSET_TABS[0];
  const isOther = tab.id === "other";
  const mediaType = ui.projectOtherAssetMediaType ?? "video";
  const importedAssets = filterAndSortImportedAssets(
    getImportedAssetEntries(state, ui, tab.id, mediaType),
    ui,
  );
  const mediaLabel = mediaType === "image" ? "图片" : "视频";
  const filterLabel =
    ui.assetFilterMode === "with-preview"
      ? "有预览"
      : ui.assetFilterMode === "generated"
        ? "已生成"
        : "全部";

  return `
    <section class="project-asset-library" aria-label="资产">
      <header class="asset-library-head">
        <h1>资产</h1>
        <div class="asset-library-tabs" role="tablist" aria-label="资产类型">
          ${ASSET_TABS.map((item) => renderProjectAssetTab(item, item.id === tab.id)).join("")}
        </div>
        ${isOther ? renderOtherAssetSubtabs(mediaType) : ""}
        <div class="asset-library-tools">
          <button class="asset-sort-button" type="button" data-action="toggle-asset-sort-order">${ui.assetSortOrder === "desc" ? "时间倒序" : "时间正序"} <span aria-hidden="true">⌄</span></button>
          ${
            isOther
              ? ""
              : `<button class="asset-filter-button" type="button" data-action="toggle-asset-filter-mode">${escapeHtml(filterLabel)} <span aria-hidden="true">⌄</span></button><label class="asset-main-check"><input id="asset-only-main-input" type="checkbox" ${ui.assetOnlyMain ? "checked" : ""} />主体</label>`
          }
          <label class="asset-search-field">
            <span aria-hidden="true">⌕</span>
            <input id="asset-search-input" type="search" value="${escapeHtml(ui.assetSearchQuery ?? "")}" placeholder="${escapeHtml(isOther ? ('搜索你所需要的' + mediaLabel) : tab.search)}" />
          </label>
          ${
            isOther
              ? ""
              : `<div class="asset-view-toggle"><button class="${ui.assetViewMode !== "list" ? "active" : ""}" type="button" data-action="set-asset-view-mode" data-view-mode="grid">▦</button><button class="${ui.assetViewMode === "list" ? "active" : ""}" type="button" data-action="set-asset-view-mode" data-view-mode="list">☰</button></div>`
          }
        </div>
      </header>
      ${renderAssetLibraryReturnNotice(ui, tab.id, mediaType)}

      <div class="asset-library-stage ${isOther ? "other-mode" : ""}">
        ${
          isOther
            ? renderOtherAssetLibrary(mediaType, importedAssets, ui)
            : renderAssetLibraryCollection(tab, importedAssets, ui)
        }
      </div>
    </section>
  `;
}

function renderProjectAssetTab(tab, active) {
  return `
    <button
      class="asset-library-tab ${active ? "active" : ""}"
      type="button"
      role="tab"
      aria-selected="${active ? "true" : "false"}"
      data-action="set-project-asset-tab"
      data-asset-tab="${escapeHtml(tab.id)}"
    >
      <span class="asset-library-tab-icon" aria-hidden="true">${tab.icon}</span>
      ${escapeHtml(tab.label)}
    </button>
  `;
}

function renderOtherAssetSubtabs(mediaType) {
  return `
    <div class="other-media-tabs" role="tablist" aria-label="其它资产媒体类型">
      ${["video", "image"]
        .map((type) => {
          const label = type === "video" ? "视频" : "图片";
          return `
            <button
              class="${mediaType === type ? "active" : ""}"
              type="button"
              data-action="set-project-other-asset-media"
              data-media-type="${type}"
            >
              ${label}
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderAssetCreationCards(tab) {
  const data = ASSET_LIBRARY_CONFIG[tab.id];
  const label = data.label;

  return `
    <section class="asset-intake-hero" role="button" tabindex="0" data-action="open-script-modal">
      <span class="asset-intake-badge">首次免费</span>
      <div class="asset-intake-copy">
        <strong>AI 智能提取资产</strong>
      </div>
    </section>
    <section class="asset-action-grid">
      <button
        class="asset-generate-card ${data.tone}"
        type="button"
        data-action="open-asset-generator-modal"
        data-asset-kind="${tab.id}"
      >
        <span class="asset-card-visual ${data.art}" aria-hidden="true">✦</span>
        <strong>生成${label}</strong>
      </button>
      <button
        class="asset-import-card"
        type="button"
        data-action="open-asset-import-modal"
        data-asset-kind="${tab.id}"
      >
        <span class="asset-card-visual import-mark" aria-hidden="true">⇩</span>
        <strong>导入${label}</strong>
      </button>
    </section>
  `;
}

function renderAssetLibraryCollection(tab, importedAssets, ui) {
  if (!importedAssets.length) {
    return renderAssetEmptyLibrary(tab);
  }

  return `
    <section class="asset-library-collection">
      <div class="asset-library-actions-column">
        ${renderAssetCreationCards(tab)}
      </div>
      <div class="asset-library-content-grid ${ui.assetViewMode === "list" ? "list-mode" : "grid-mode"}">
        ${
          importedAssets.length
            ? importedAssets.map((asset) => renderImportedAssetCard(asset, ui)).join("")
            : '<article class="asset-library-empty-card"><strong>还没有已导入资产</strong><span>可以先从左侧导入，完成后会在这里按卡片形式展示。</span></article>'
        }
      </div>
    </section>
  `;
}

function renderAssetEmptyLibrary(tab) {
  const data = ASSET_LIBRARY_CONFIG[tab.id];
  return `
    <section class="asset-library-empty-showcase">
      <div class="asset-library-empty-showcase-inner">
        ${renderAssetCreationCards(tab)}
        <article class="asset-library-empty-card empty-showcase-card">
          <strong>${escapeHtml(data.emptyTitle)}</strong>
          <span>${escapeHtml(data.emptyCopy)}</span>
        </article>
      </div>
    </section>
  `;
}

function renderOtherAssetLibrary(mediaType, importedAssets, ui) {
  const label = mediaType === "image" ? "图片" : "视频";
  return `
    <section class="other-asset-library">
      <button class="seedance-import-card" type="button" data-action="open-asset-import-modal" data-asset-kind="other">
        <span aria-hidden="true">✦</span>
        导入 Seedance 2.0${label}主体
      </button>
      ${
        importedAssets.length
          ? importedAssets.map((asset) => renderOtherImportedAssetCard(asset, mediaType, ui)).join("")
          : `
            <div class="seedance-library-empty">
              <strong>该资源库为 Seedance 2.0 专享资源库</strong>
              <p>暂无${label}，立即上传一个${label === "图片" ? "图片" : "视频"}主体吧。</p>
            </div>
          `
      }
    </section>
  `;
}

function renderImportedAssetCard(asset, ui) {
  const preview = resolveImportedAssetPreview(asset);
  const menuId = `asset-menu-${asset.id}`;
  const isMenuOpen = ui.assetCardMenuId === menuId;
  const isHighlighted = isImportedAssetHighlighted(ui, asset.kind, "image", asset.id);
  return `
    <article
      class="imported-asset-card ${escapeHtml(ASSET_LIBRARY_CONFIG[asset.kind]?.importedCardClass ?? "portrait")} ${isHighlighted ? "just-imported" : ""}"
      data-imported-asset-id="${escapeHtml(asset.id)}"
      tabindex="-1"
    >
      <div class="imported-asset-preview">
        ${preview ? `<img src="${escapeHtml(resolveApiUrl(preview))}" alt="${escapeHtml(asset.name)}" loading="lazy" />` : '<span class="asset-preview-placeholder" aria-hidden="true">✦</span>'}
      </div>
      <div class="imported-asset-meta asset-card-meta-row">
        <div class="asset-card-copy">
          <strong>${escapeHtml(asset.name)}</strong>
          <span>${escapeHtml(asset.description || (asset.source === "generated" ? "已生成资产" : "已导入资产"))}</span>
        </div>
        <button
          class="asset-card-menu-button"
          type="button"
          data-action="toggle-asset-card-menu"
          data-asset-menu-id="${escapeHtml(menuId)}"
          aria-haspopup="menu"
          aria-expanded="${isMenuOpen ? "true" : "false"}"
          aria-label="更多操作"
        >⋮</button>
      </div>
      ${isMenuOpen ? renderImportedAssetMenu(asset, asset.kind, "image") : ""}
    </article>
  `;
}

function renderOtherImportedAssetCard(asset, mediaType, ui) {
  const preview = resolveImportedAssetPreview(asset);
  const menuId = `asset-menu-${asset.id}`;
  const isMenuOpen = ui.assetCardMenuId === menuId;
  const isHighlighted = isImportedAssetHighlighted(ui, "other", mediaType, asset.id);
  return `
    <article
      class="other-imported-card ${mediaType} ${isHighlighted ? "just-imported" : ""}"
      data-imported-asset-id="${escapeHtml(asset.id)}"
      tabindex="-1"
    >
      <div class="other-imported-preview">
        ${preview ? `<img src="${escapeHtml(resolveApiUrl(preview))}" alt="${escapeHtml(asset.name)}" loading="lazy" />` : '<span class="asset-preview-placeholder" aria-hidden="true">✦</span>'}
        ${mediaType === "video" ? '<span class="other-imported-play" aria-hidden="true">▶</span>' : ""}
        <span class="other-imported-badge">审核中</span>
      </div>
      <div class="asset-card-meta-row">
        <div class="asset-card-copy">
          <strong>${escapeHtml(asset.name)}</strong>
          <span>${escapeHtml(asset.description || (asset.source === "generated" ? "已生成资产" : "已导入资产"))}</span>
        </div>
        <button
          class="asset-card-menu-button"
          type="button"
          data-action="toggle-asset-card-menu"
          data-asset-menu-id="${escapeHtml(menuId)}"
          aria-haspopup="menu"
          aria-expanded="${isMenuOpen ? "true" : "false"}"
          aria-label="更多操作"
        >⋮</button>
      </div>
      ${isMenuOpen ? renderImportedAssetMenu(asset, "other", mediaType) : ""}
    </article>
  `;
}

function renderImportedAssetMenu(asset, assetKind, mediaType) {
  return `
    <div class="asset-card-menu" role="menu" aria-label="资产操作">
      <button class="asset-card-menu-item" type="button" data-action="edit-imported-asset" data-asset-id="${escapeHtml(asset.id)}" data-asset-kind="${escapeHtml(assetKind)}" data-media-type="${escapeHtml(mediaType)}"><span aria-hidden="true">✎</span>编辑</button>
      <button class="asset-card-menu-item" type="button" data-action="rename-imported-asset" data-asset-id="${escapeHtml(asset.id)}" data-asset-kind="${escapeHtml(assetKind)}" data-media-type="${escapeHtml(mediaType)}"><span aria-hidden="true">⌁</span>重命名</button>
      <button class="asset-card-menu-item" type="button" data-action="download-imported-asset" data-asset-id="${escapeHtml(asset.id)}" data-asset-kind="${escapeHtml(assetKind)}" data-media-type="${escapeHtml(mediaType)}"><span aria-hidden="true">⇩</span>下载</button>
      <button class="asset-card-menu-item danger" type="button" data-action="delete-imported-asset" data-asset-id="${escapeHtml(asset.id)}" data-asset-kind="${escapeHtml(assetKind)}" data-media-type="${escapeHtml(mediaType)}"><span aria-hidden="true">⌦</span>删除</button>
    </div>
  `;
}

export function renderAssetImportModal(ui) {
  const activeTab = ui.assetImportModalTab ?? "local";
  const assetKind = ui.assetImportModal ?? "character";
  const assetLabel = getAssetModalLabel(assetKind, ui.projectOtherAssetMediaType ?? "video");
  const isEpisodeWorkbenchLibraryModal =
    ui.projectPanelMode === "episode-workbench" &&
    assetKind !== "other" &&
    ui.assetImportModalSource !== "official" &&
    ui.assetImportModalSource !== "team";

  if (isEpisodeWorkbenchLibraryModal) {
    return renderEpisodeWorkbenchAssetImportModal(ui, assetKind);
  }

  return `
    <section class="asset-import-backdrop modal-backdrop" role="dialog" aria-modal="true" aria-label="import-asset-dialog">
      <div class="asset-import-modal ${assetKind === "character" ? "character-import-flow" : ""} ${assetKind === "other" ? "other-import-flow" : ""}">
        <button class="asset-modal-close" type="button" data-action="close-asset-import-modal" aria-label="关闭">×</button>
        <header class="asset-import-header">
          <h2>导入${escapeHtml(assetLabel)}</h2>
          <nav class="asset-import-tabs" aria-label="导入来源">
            ${renderAssetImportTab(activeTab, "local", "本地导入")}
            ${renderAssetImportTab(activeTab, "team", "团队资产库")}
            ${renderAssetImportTab(activeTab, "official", "官方资产库")}
          </nav>
        </header>
        ${renderAssetImportBody(ui, activeTab, assetKind)}
      </div>
    </section>
  `;
}

function renderEpisodeWorkbenchAssetImportModal(ui, assetKind) {
  const tabs = [
    { id: "character", label: "角色" },
    { id: "scene", label: "场景" },
    { id: "prop", label: "道具" },
  ];
  const episodeBackedAssets = resolveEpisodeWorkbenchModalAssets(ui, assetKind);
  const projectLibraryBackedAssets =
    assetKind === "character"
      ? (ui.projectLibraryAssetsByType?.character ?? []).map((asset) => ({
          id: asset.id,
          name: asset.label ?? asset.assetKey ?? "未命名资产",
          preview: asset.previewUrl ?? asset.latestVersion?.previewUrl ?? "",
        }))
      : assetKind === "scene"
        ? (ui.projectLibraryAssetsByType?.scene ?? []).map((asset) => ({
            id: asset.id,
            name: asset.label ?? asset.assetKey ?? "未命名资产",
            preview: asset.previewUrl ?? asset.latestVersion?.previewUrl ?? "",
          }))
        : (ui.projectLibraryAssetsByType?.prop ?? []).map((asset) => ({
            id: asset.id,
            name: asset.label ?? asset.assetKey ?? "未命名资产",
            preview: asset.previewUrl ?? asset.latestVersion?.previewUrl ?? "",
          }));
  const assets = normalizeEpisodeWorkbenchImportAssets(
    episodeBackedAssets.length ? episodeBackedAssets : projectLibraryBackedAssets,
  );
  const pageSize = normalizeAssetImportPageSize(ui.assetImportPageSize);
  const totalPages = Math.max(1, Math.ceil(assets.length / pageSize));
  const currentPage = clampAssetImportPage(ui.assetImportPage ?? 1, totalPages);
  const start = (currentPage - 1) * pageSize;
  const visibleAssets = assets.slice(start, start + pageSize);
  const selection = ui.assetImportSelection ?? [];
  const pageSizes = [10, 20, 50, 100];
  const hasAssets = assets.length > 0;

  return `
    <section class="asset-import-backdrop modal-backdrop" role="dialog" aria-modal="true" aria-label="from-library-dialog">
      <div class="episode-asset-library-modal">
        <button class="asset-modal-close" type="button" data-action="close-asset-import-modal" aria-label="关闭">×</button>
        <header class="episode-asset-library-head">
          <h2>从资产库添加</h2>
          <nav class="episode-asset-library-tabs" aria-label="资产类型">
            ${tabs
              .map(
                (tab) => `
                  <button
                    class="${tab.id === assetKind ? "active" : ""}"
                    type="button"
                    data-action="set-asset-import-kind"
                    data-asset-kind="${escapeAttr(tab.id)}"
                  >
                    ${escapeHtml(tab.label)}
                  </button>
                `,
              )
              .join("")}
          </nav>
        </header>
        <div class="episode-asset-library-body ${hasAssets ? "" : "empty"}">
          ${
            hasAssets
              ? `
                <div class="episode-asset-library-grid" data-asset-import-kind="${escapeAttr(assetKind)}">
                  ${visibleAssets
                    .map(
                      (asset) => `
                        <button
                          type="button"
                          class="episode-asset-library-card ${selection.includes(asset.id) ? "selected" : ""}"
                          data-action="toggle-official-asset-import"
                          data-asset-id="${escapeAttr(asset.id)}"
                        >
                          <span class="episode-asset-library-check ${selection.includes(asset.id) ? "selected" : ""}" aria-hidden="true"></span>
                          <span class="episode-asset-library-thumb" aria-hidden="true">
                            ${asset.preview ? `<img src="${escapeHtml(resolveApiUrl(asset.preview))}" alt="${escapeHtml(asset.name)}" />` : '<span class="asset-preview-placeholder" aria-hidden="true">✦</span>'}
                          </span>
                          <strong>${escapeHtml(asset.name)}</strong>
                        </button>
                      `,
                    )
                    .join("")}
                </div>
                <footer class="episode-asset-library-footer">
                  <div class="episode-asset-library-pagination">
                    <span>共 ${assets.length} 条</span>
                    <div class="episode-asset-library-page-size-wrap">
                      <button
                        class="episode-asset-library-page-size"
                        type="button"
                        data-action="toggle-asset-import-page-size-menu"
                        aria-expanded="${ui.assetImportPageSizeMenuOpen ? "true" : "false"}"
                      >
                        ${pageSize}条/页
                      </button>
                      ${
                        ui.assetImportPageSizeMenuOpen
                          ? `
                            <div class="episode-asset-library-page-size-menu">
                              ${pageSizes
                                .map(
                                  (size) => `
                                    <button type="button" data-action="set-asset-import-page-size" data-page-size="${size}">
                                      ${size}条/页
                                    </button>
                                  `,
                                )
                                .join("")}
                            </div>
                          `
                          : ""
                      }
                    </div>
                    <div class="episode-asset-library-page-controls">
                      <button type="button" data-action="change-asset-import-page" data-page="${currentPage - 1}" ${disabled(currentPage <= 1)}>上一页</button>
                      <em>${currentPage}</em>
                      <button type="button" data-action="change-asset-import-page" data-page="${currentPage + 1}" ${disabled(currentPage >= totalPages)}>下一页</button>
                    </div>
                  </div>
                  <button type="button" class="asset-import-confirm-button" data-action="confirm-asset-import" ${disabled(!selection.length)}>确认</button>
                </footer>
              `
              : `
                <div class="episode-asset-library-empty">
                  <span class="asset-import-lock" aria-hidden="true">✦</span>
                  <strong>暂无数据</strong>
                </div>
                <footer class="episode-asset-library-footer empty">
                  <button type="button" class="asset-import-confirm-button" data-action="confirm-asset-import" disabled>确认</button>
                </footer>
              `
          }
        </div>
      </div>
    </section>
  `;
}

function normalizeEpisodeWorkbenchImportAssets(assets = []) {
  return assets.map((asset) => ({
    id: asset.id,
    name: asset.name ?? asset.label ?? "未命名资产",
    preview: resolveApiUrl(asset.preview ?? asset.previewUrl ?? asset.previewDataUrl ?? ""),
  }));
}

function resolveEpisodeWorkbenchModalAssets(ui, assetKind) {
  const sources = [
    ui.importedAssets?.[assetKind],
    ...resolveEpisodeWorkbenchModalAssetSources(ui.episodeWorkbenchContext, assetKind),
    ...resolveEpisodeWorkbenchModalAssetSources(ui.episodeWorkbenchContext?.data, assetKind),
    ...resolveEpisodeWorkbenchModalAssetSources(ui.projectDetail, assetKind),
  ];
  const assets = [];
  const seen = new Set();
  for (const source of sources) {
    for (const asset of normalizeEpisodeWorkbenchAssetSource(source)) {
      const id = String(asset?.id ?? asset?.assetId ?? "").trim();
      if (!id || seen.has(id)) {
        continue;
      }
      seen.add(id);
      assets.push({
        id,
        name: asset.name ?? asset.label ?? asset.assetKey ?? "未命名资产",
        preview:
          asset.previewUrl ??
          asset.preview ??
          asset.fixedImageUrl ??
          asset.latestVersion?.previewUrl ??
          "",
      });
    }
  }
  return assets;
}

function resolveEpisodeWorkbenchModalAssetSources(container, assetKind) {
  if (!container || typeof container !== "object") {
    return [];
  }
  return [
    ...resolveEpisodeWorkbenchModalAssetKindSources(container.assetsByType, assetKind),
    ...resolveEpisodeWorkbenchModalAssetKindSources(container.assets, assetKind),
    ...resolveEpisodeWorkbenchModalAssetKindSources(container.episodeAssets, assetKind),
  ];
}

function resolveEpisodeWorkbenchModalAssetKindSources(assetsByType, assetKind) {
  if (!assetsByType || typeof assetsByType !== "object") {
    return [];
  }
  const keys =
    assetKind === "character"
      ? ["character", "characters", "role", "roles"]
      : assetKind === "scene"
        ? ["scene", "scenes"]
        : ["prop", "props"];
  return keys.map((key) => assetsByType[key]).filter(Boolean);
}

function normalizeEpisodeWorkbenchAssetSource(source) {
  if (Array.isArray(source)) {
    return source;
  }
  if (source && typeof source === "object" && Array.isArray(source.items)) {
    return source.items;
  }
  return [];
}

function normalizeAssetImportPageSize(value) {
  const pageSize = Number(value);
  if ([10, 20, 50, 100].includes(pageSize)) {
    return pageSize;
  }
  return 10;
}

function clampAssetImportPage(value, totalPages) {
  const page = Number(value);
  if (!Number.isFinite(page)) {
    return 1;
  }
  return Math.min(Math.max(Math.trunc(page), 1), totalPages);
}

function renderAssetImportTab(activeTab, tab, label) {
  return `
    <button class="asset-import-tab ${activeTab === tab ? "active" : ""}" type="button" data-action="switch-asset-import-tab" data-tab="${tab}">
      ${label}
    </button>
  `;
}

function renderAssetImportBody(ui, activeTab, assetKind) {
  if (activeTab === "team") {
    return `
      <section class="asset-import-empty-state">
        <div class="asset-import-lock" aria-hidden="true">✦</div>
        <p>团队资产库暂未开放，开通后可同步管理共享素材。</p>
        <button type="button" class="asset-import-upgrade">立即开通</button>
      </section>
    `;
  }

  if (activeTab === "official") {
    const categories = [
      ["domestic-modern-city", "国内真人 · 现代都市"],
      ["domestic-ancient", "国内真人 · 古风"],
      ["three-d-modern", "3D · 现代都市"],
      ["three-d-fantasy", "3D · 东方幻想"],
      ["two-d-modern", "2D · 现代都市"],
      ["two-d-fantasy", "2D · 东方幻想"],
    ];
    const officialAssets = ui.assetImportOfficialAssets ?? [];
    const selection = ui.assetImportSelection ?? [];

    return `
      <section class="asset-import-library">
        <aside class="asset-import-sidebar" aria-label="官方分类">
          ${categories
            .map(
              ([id, label]) => `
                <button class="asset-import-category ${ui.assetImportCategory === id ? "active" : ""}" type="button" data-action="select-asset-import-category" data-category="${id}">
                  <span aria-hidden="true">•</span>
                  ${label}
                </button>
              `,
            )
            .join("")}
        </aside>
        <div class="asset-import-library-main">
          <div class="asset-import-library-head">
            <h3>官方${escapeHtml(getAssetLabel(assetKind))}</h3>
            <label class="asset-import-search">
              <span aria-hidden="true">⌕</span>
              <input type="search" placeholder="搜索素材" />
            </label>
          </div>
          <div class="asset-import-grid">
            ${officialAssets.length
              ? officialAssets
                  .map(
                    (asset) => `
                      <button type="button" class="asset-import-card-item ${selection.includes(asset.id) ? "selected" : ""}" data-action="toggle-official-asset-import" data-asset-id="${asset.id}">
                        <span class="asset-import-check ${selection.includes(asset.id) ? "selected" : ""}" aria-hidden="true">${selection.includes(asset.id) ? "✓" : ""}</span>
                        <span class="asset-import-thumb" aria-hidden="true"><img src="${escapeHtml(asset.preview)}" alt="${escapeHtml(asset.name)}" /></span>
                        <strong>${escapeHtml(asset.name)}</strong>
                      </button>
                    `,
                  )
                  .join("")
              : `<div class="asset-import-empty-state">
                  <div class="asset-import-lock" aria-hidden="true">✦</div>
                  <p>当前真实资产库里还没有${escapeHtml(getAssetLabel(assetKind))}素材。</p>
                </div>`}
          </div>
          <footer class="asset-import-footer">
            <button type="button" class="asset-import-confirm-button" data-action="confirm-asset-import" ${disabled(!selection.length)}>确认导入</button>
          </footer>
        </div>
      </section>
    `;
  }

  if (ui.assetImportDrafts?.length) {
    return renderAssetImportReview(ui, assetKind);
  }

  const config = ASSET_LIBRARY_CONFIG[assetKind] ?? ASSET_LIBRARY_CONFIG.character;
  const mediaType = ui.projectOtherAssetMediaType ?? "video";
  const presetKind = assetKind === "other" ? `other-${mediaType}` : config.presetKind;
  const noteLink =
    assetKind === "other"
      ? ""
      : ` <a href="#" onclick="return false;">${escapeHtml(config.importLinkLabel)}</a>`;

  return `
    <section class="asset-import-local">
      <div class="asset-import-banner ${assetKind === "other" ? "other-tone" : ""}">
        <span class="asset-import-banner-icon" aria-hidden="true">✦</span>
        <strong>${escapeHtml(getAssetImportHint(assetKind, mediaType))}</strong>
        <button type="button" class="asset-import-banner-action">我知道了</button>
      </div>
      <div class="asset-import-presets">
        ${getAssetImportPresets(presetKind)
          .map(
            ([label, kind]) => `
              <article class="asset-import-preset">
                <div class="asset-import-preset-visual ${kind}" aria-hidden="true"></div>
                <footer>${label}</footer>
              </article>
            `,
          )
          .join("")}
      </div>
      <p class="asset-import-note">${escapeHtml(getAssetImportNote(assetKind, mediaType))}${noteLink}</p>
      <button
        class="asset-import-dropzone ${escapeHtml(config.dropzoneMode ?? "")}"
        type="button"
        data-action="pick-asset-import-files"
        data-dropzone="asset-import"
      >
        <input
          class="asset-import-file-input"
          type="file"
          accept="${escapeHtml(getAssetImportAccept(assetKind, ui.projectOtherAssetMediaType ?? "video"))}"
          multiple
        />
        <span class="asset-import-upload-icon" aria-hidden="true">⇪</span>
        <strong>${escapeHtml(getAssetDropzoneTitle(assetKind, mediaType))}</strong>
        <span>${escapeHtml(getAssetDropzoneCopy(assetKind, mediaType))}</span>
      </button>
    </section>
  `;
}

function renderOtherAssetEmpty(mediaType) {
  const label = mediaType === "image" ? "图片" : "视频";
  return `
    <section class="other-asset-empty">
      <button class="seedance-import-card" type="button">
        <span aria-hidden="true">✦</span>
        导入 Seedance 2.0${label}主体
      </button>
      <div class="seedance-library-empty">
        <strong>该资源库为 <span aria-hidden="true">🪽</span> Seedance 2.0 专享资源库</strong>
        <p>暂无${label}，立即上传一个${label === "图片" ? "图片" : "视频"}主体吧！</p>
      </div>
    </section>
  `;
}

function renderAssetImportReview(ui, assetKind) {
  const label = getAssetModalLabel(assetKind, ui.projectOtherAssetMediaType ?? "video");
  const selection = ui.assetImportSelection ?? [];
  const config = ASSET_LIBRARY_CONFIG[assetKind] ?? ASSET_LIBRARY_CONFIG.character;

  return `
    <section class="asset-import-review">
      <p class="asset-import-success-copy">本次上传成功 ${ui.assetImportDrafts.length} 个，请确认以下${escapeHtml(label)}名称:</p>
      <div class="asset-import-review-list">
        ${ui.assetImportDrafts
          .map(
            (draft, index) => `
              <article class="asset-import-review-item">
                <button
                  class="asset-import-review-check ${selection.includes(draft.id) ? "selected" : ""}"
                  type="button"
                  data-action="toggle-asset-import-draft"
                  data-draft-id="${draft.id}"
                >
                  ${selection.includes(draft.id) ? "✓" : ""}
                </button>
                <span class="asset-import-review-index">${String(index + 1).padStart(2, "0")}</span>
                <div class="asset-import-review-thumb">
                  <img src="${escapeHtml(draft.preview)}" alt="${escapeHtml(draft.name)}" />
                </div>
                <div class="asset-import-review-form">
                  <strong>${escapeHtml(label)}名称</strong>
                  <label class="asset-import-review-field">
                    <input
                      class="asset-import-name-input"
                      type="text"
                      value="${escapeHtml(draft.name)}"
                      data-draft-id="${draft.id}"
                    />
                    <span>${[...(draft.name ?? "")].length}/50</span>
                  </label>
                </div>
                <button type="button" class="asset-import-description-button">${escapeHtml(config.addDescriptionLabel)}</button>
              </article>
            `,
          )
          .join("")}
      </div>
      <footer class="asset-import-review-footer">
        <span>${escapeHtml(config.reviewFootnote)}</span>
        <div class="asset-import-review-actions">
          <button type="button" class="asset-import-secondary-button" data-action="confirm-asset-import">导入并保存为主体</button>
          <button type="button" class="asset-import-confirm-button" data-action="confirm-asset-import" ${disabled(!selection.length)}>确认导入</button>
        </div>
      </footer>
    </section>
  `;
}

function getImportedAssetEntries(state, ui, assetKind, mediaType = "video") {
  const preferWorkbenchAssets = ui.projectPanelMode === "episode-workbench";
  if (preferWorkbenchAssets) {
    if (assetKind === "other") {
      return ui.importedAssets?.other?.[mediaType] ?? [];
    } else {
      return ui.importedAssets?.[assetKind] ?? [];
    }
  }
  const detailAssets = state?.projectDetail?.assetsByType;
  if (detailAssets) {
    if (assetKind === "other") {
      return mapDetailAssets(detailAssets.other?.[mediaType] ?? [], "other");
    }
    return mapDetailAssets(detailAssets[assetKind] ?? [], assetKind);
  }
  if (assetKind === "other") {
    return ui.importedAssets?.other?.[mediaType] ?? [];
  }
  return ui.importedAssets?.[assetKind] ?? [];
}

function mapDetailAssets(assets, kind) {
  return assets.map((asset) => ({
    id: asset.id,
    name: asset.label ?? asset.assetKey ?? "未命名资产",
    preview: resolvePreferredPreviewUrl(
      asset.previewUrl,
      asset.latestVersion?.metadata?.fixedImageUrl,
      asset.latestVersion?.previewUrl,
      asset.latestVersion?.metadata?.previewUrl,
    ),
    description: asset.latestVersion?.metadata?.description ?? asset.assetKey ?? "",
    kind,
    isMain: Boolean(asset.latestVersion?.metadata?.isMain),
    source: asset.latestVersion?.metadata?.source ?? "import",
    updatedAt: asset.updatedAt ?? asset.latestVersion?.createdAt ?? asset.createdAt ?? null,
    latestVersion: asset.latestVersion ?? null,
  }));
}

function filterAndSortImportedAssets(assets, ui) {
  const query = String(ui.assetSearchQuery ?? "").trim().toLowerCase();
  const filterMode = ui.assetFilterMode ?? "all";
  const onlyMain = Boolean(ui.assetOnlyMain);
  const sortOrder = ui.assetSortOrder ?? "desc";

  return [...assets]
    .filter((asset) => {
      if (query) {
        const haystack = `${asset.name ?? ""} ${asset.description ?? ""}`.toLowerCase();
        if (!haystack.includes(query)) {
          return false;
        }
      }
      if (onlyMain && !asset.isMain) {
        return false;
      }
      if (filterMode === "with-preview" && !asset.preview) {
        return false;
      }
      if (filterMode === "generated" && asset.source !== "generated") {
        return false;
      }
      return true;
    })
    .sort((left, right) => {
      const leftTime = Date.parse(left.updatedAt ?? "") || 0;
      const rightTime = Date.parse(right.updatedAt ?? "") || 0;
      return sortOrder === "asc" ? leftTime - rightTime : rightTime - leftTime;
    });
}

function renderAssetLibraryReturnNotice(ui, assetKind, mediaType) {
  const message = String(ui.assetLibraryHighlightMessage ?? "").trim();
  if (!message) {
    return "";
  }
  const matchesKind = (ui.assetLibraryHighlightKind ?? null) === assetKind;
  const matchesMedia =
    assetKind !== "other" || (ui.assetLibraryHighlightMediaType ?? "video") === mediaType;
  if (!matchesKind || !matchesMedia) {
    return "";
  }
  return `<p class="asset-library-return-note" role="status">${escapeHtml(message)}</p>`;
}

function isImportedAssetHighlighted(ui, assetKind, mediaType, assetId) {
  const highlightedIds = ui.assetLibraryHighlightAssetIds ?? [];
  if (!highlightedIds.includes(assetId)) {
    return false;
  }
  if ((ui.assetLibraryHighlightKind ?? null) !== assetKind) {
    return false;
  }
  if (assetKind === "other" && (ui.assetLibraryHighlightMediaType ?? "video") !== mediaType) {
    return false;
  }
  return true;
}

function getAssetModalLabel(assetKind, mediaType = "video") {
  if (assetKind === "other") {
    return mediaType === "image" ? "图片主体" : "视频主体";
  }
  return getAssetLabel(assetKind);
}

function getAssetLabel(assetKind) {
  return (
    {
      character: "角色",
      scene: "场景",
      prop: "道具",
      other: "其它",
    }[assetKind] ?? "资产"
  );
}

function getAssetImportAccept(assetKind, otherMediaType = "video") {
  if (assetKind === "other") {
    return otherMediaType === "image" ? "image/*" : "video/*";
  }
  return "image/*";
}

function getAssetImportHint(assetKind, mediaType = "video") {
  if (assetKind === "other") {
    return mediaType === "image"
      ? "上传图片主体后，可在图片分镜中作为统一参考主体使用"
      : "上传视频主体后，可在视频分镜中作为统一参考主体使用";
  }
  return ASSET_LIBRARY_CONFIG[assetKind]?.importHint ?? ASSET_LIBRARY_CONFIG.character.importHint;
}

function getAssetImportNote(assetKind, mediaType = "video") {
  if (assetKind === "other") {
    return mediaType === "image"
      ? "支持上传单张图片主体，上传完成后可在确认页修改名称并导入。"
      : "支持上传视频主体素材，上传完成后可在确认页修改名称并导入。";
  }
  return ASSET_LIBRARY_CONFIG[assetKind]?.importNote ?? ASSET_LIBRARY_CONFIG.character.importNote;
}

function getAssetDropzoneTitle(assetKind, mediaType = "video") {
  if (assetKind === "other") {
    return mediaType === "image" ? "点击或直接拖拽图片主体上传" : "点击或直接拖拽视频主体上传";
  }
  return ASSET_LIBRARY_CONFIG[assetKind]?.dropzoneTitle ?? ASSET_LIBRARY_CONFIG.character.dropzoneTitle;
}

function getAssetDropzoneCopy(assetKind, mediaType = "video") {
  if (assetKind === "other") {
    return mediaType === "image"
      ? "支持 PNG、JPG 等图片格式，确认后会展示在当前图片主体资源库"
      : "支持 MP4、MOV 等视频格式，确认后会展示在当前视频主体资源库";
  }
  return ASSET_LIBRARY_CONFIG[assetKind]?.dropzoneCopy ?? ASSET_LIBRARY_CONFIG.character.dropzoneCopy;
}

function getAssetImportPresets(kind) {
  const presetMap = {
    character: [
      ["主视图", "silhouette"],
      ["特写", "closeup"],
      ["特写+主视图", "pair"],
      ["三视图", "triple"],
      ["特写+三视图", "mixed"],
    ],
    scene: [
      ["街道外景", "street"],
      ["餐厅内景", "interior"],
      ["天台夜景", "roof"],
      ["办公区", "studio"],
      ["自然环境", "forest"],
    ],
    prop: [
      ["白底主体", "prop-single"],
      ["细节特写", "prop-detail"],
      ["成组展示", "prop-set"],
      ["佩戴示意", "prop-wear"],
      ["多角度", "prop-multi"],
    ],
    "other-video": [
      ["主体视频", "video-frame"],
      ["半身视频", "video-portrait"],
      ["动态样片", "video-sample"],
      ["横版样片", "video-wide"],
      ["近景素材", "video-close"],
    ],
    "other-image": [
      ["人物主体", "image-subject"],
      ["半身参考", "image-half"],
      ["正面参考", "image-front"],
      ["近景参考", "image-close"],
      ["风格参考", "image-style"],
    ],
  };

  return presetMap[kind] ?? presetMap.character;
}

function renderAssetGeneratorModal(ui) {
  const assetKind = ui.assetGeneratorModal ?? "character";
  const tab = ASSET_TABS.find((item) => item.id === assetKind) ?? ASSET_TABS[0];
  const label = tab.label;
  const isEditing = ui.assetGeneratorMode === "edit";
  const isCharacter = assetKind === "character";
  const isScene = assetKind === "scene";
  const name = ui.assetGeneratorName ?? "";
  const prompt = ui.assetGeneratorPrompt ?? "";
  const importedAssets = getImportedAssetEntries({}, ui, assetKind, ui.projectOtherAssetMediaType ?? "image");
  const editingAsset = ui.assetGeneratorEditingAsset ?? null;
  const previewAssets = editingAsset
    ? [editingAsset]
    : importedAssets.length
    ? importedAssets
    : [{
        id: `${assetKind}-preview-default`,
        name,
        preview:
          "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='228' viewBox='0 0 300 228'%3E%3Crect width='300' height='228' rx='18' fill='%2332353f'/%3E%3Crect x='16' y='16' width='268' height='140' rx='14' fill='url(%23g)'/%3E%3Crect x='16' y='172' width='144' height='16' rx='8' fill='%23434655'/%3E%3Crect x='16' y='196' width='98' height='12' rx='6' fill='%23393c48'/%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1' y1='0' y2='1'%3E%3Cstop stop-color='%23525461'/%3E%3Cstop offset='1' stop-color='%23272831'/%3E%3C/linearGradient%3E%3C/defs%3E%3C/svg%3E",
      }];

  return `
    <section class="asset-generator-backdrop" role="dialog" aria-modal="true" aria-label="生成${escapeHtml(label)}">
      <div class="asset-generator-modal">
        <button class="asset-modal-close" type="button" data-action="close-asset-generator-modal" aria-label="关闭">×</button>
        <aside class="asset-generator-form">
          <h2>${isEditing ? "编辑" : "生成"}${escapeHtml(label)}</h2>
          <label class="asset-generator-field">
            <span>${escapeHtml(label)}名称 <b>*</b></span>
            <div class="asset-generator-name-row">
              <input id="asset-generator-name-input" type="text" value="${escapeHtml(name)}" placeholder="请输入${escapeHtml(label)}名称" />
              <button class="asset-generator-ghost-button" type="button">添加${escapeHtml(ASSET_LIBRARY_CONFIG[assetKind]?.addDescriptionLabel ?? "描述")}</button>
            </div>
            <em class="asset-generator-name-count">${[...name].length}/50</em>
          </label>
          ${isCharacter ? renderCharacterGeneratorFields(ui) : ""}
          ${isScene ? renderSceneGeneratorFields() : ""}
          ${assetKind === "prop" ? renderPropGeneratorFields() : ""}
          <label class="asset-generator-prompt">
            <span>输入提示词</span>
            <div class="asset-generator-prompt-shell">
              <button type="button" aria-label="上传参考图">✦</button>
              <textarea id="asset-generator-prompt-input" placeholder="请输入描述提示词，点击或上传添加参考图。">${escapeHtml(prompt)}</textarea>
              <small class="asset-generator-prompt-count">${[...prompt].length}/460</small>
              <footer>
                <span>${escapeHtml(ui.assetGeneratorModel ?? "即梦4.0")}</span>
                <span>${escapeHtml(ui.assetGeneratorResolution ?? "2K")}</span>
                <span>生成${escapeHtml(String(ui.assetGeneratorCount ?? 1))}张</span>
                <span>✦ 2 积分</span>
                <button type="button" data-action="submit-asset-generator">${isEditing ? "保存" : "生成"}</button>
              </footer>
            </div>
          </label>
        </aside>
        <section class="asset-generator-preview">
          ${renderAssetGeneratorPreviewColumn("定稿图片", previewAssets.slice(0, 1))}
          ${renderAssetGeneratorPreviewColumn("全部素材", previewAssets)}
        </section>
      </div>
    </section>
  `;
}

function renderCharacterGeneratorFields(ui) {
  const styleOptions = [
    ["none", "无风格"],
    ["thick-paint", "2D厚涂"],
    ["two-d", "2D日漫"],
    ["three-d", "3D国风"],
    ["three-d-anime", "3D动漫"],
    ["two-d-version", "2DQ版"],
    ["three-d-version", "3DQ版"],
  ];
  const materialOptions = [
    ["none", "无题材"],
    ["fantasy-doomsday", "末世玄幻"],
    ["eastern-cultivation", "东方修仙"],
    ["eastern-fantasy", "东方玄幻"],
    ["ancient-east", "东方古代"],
    ["palace-east", "东方宫廷"],
    ["western-fantasy", "西方玄幻"],
    ["western-palace", "西方宫廷"],
    ["modern-city", "现代都市"],
    ["urban-fantasy", "都市玄幻"],
    ["urban-martial", "都市高武"],
    ["doomsday-cultivation", "末世修仙"],
    ["republic-fantasy", "民国玄幻"],
    ["suspense", "悬疑惊悚"],
    ["future", "星际未来"],
    ["urban-weird", "都市灵异"],
    ["republic-weird", "民国灵异"],
    ["village", "乡村年代"],
  ];
  const imageTypes = [
    ["main", "主视图"],
    ["closeup", "特写"],
    ["main-closeup", "特写+主视图"],
    ["triple", "三视图"],
    ["main-triple", "特写+三视图"],
    ["custom", "自定义视图"],
  ];

  return `
    <div class="asset-generator-card">
      <span>角色类型 <i class="asset-inline-tip">i</i></span>
      <div class="segmented-row">
        <button class="${ui.assetGeneratorCharacterType !== "creature" ? "active" : ""}" type="button">人形角色</button>
        <button class="${ui.assetGeneratorCharacterType === "creature" ? "active" : ""}" type="button">非人形角色</button>
      </div>
      <label class="asset-generator-select-field">创作风格
        <div class="asset-generator-select-display">${escapeHtml(ui.assetGeneratorStyleValue ?? "无风格, 末世玄幻")} <span aria-hidden="true">⌃</span></div>
      </label>
      <div class="asset-generator-picker-card">
        <div class="asset-generator-picker-tabs">
          <button class="active" type="button">官方</button>
          <button type="button">自定义</button>
        </div>
        <div class="asset-generator-chip-group">
          ${styleOptions
            .map(
              ([id, text]) => `<button class="asset-generator-chip ${ui.assetGeneratorStyleOption === id ? "active" : ""}" type="button">${text}</button>`,
            )
            .join("")}
        </div>
        <h4>题材</h4>
        <div class="asset-generator-picker-tabs">
          <button class="active" type="button">官方</button>
          <button type="button">自定义</button>
        </div>
        <div class="asset-generator-chip-group">
          ${materialOptions
            .map(
              ([id, text]) => `<button class="asset-generator-chip ${ui.assetGeneratorMaterialOption === id ? "active" : ""}" type="button">${text}</button>`,
            )
            .join("")}
        </div>
      </div>
      <label class="asset-generator-select-field">生图类型
        <div class="asset-generator-select-display">主视图 <span aria-hidden="true">⌃</span></div>
      </label>
      <div class="asset-generator-view-grid">
        ${imageTypes
          .map(
            ([id, text]) => `<button class="asset-generator-view-card ${ui.assetGeneratorImageType === id ? "active" : ""}" type="button">${text}</button>`,
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderSceneGeneratorFields() {
  return `
    <div class="asset-generator-card">
      <div class="asset-generator-tabs">
        <button class="active" type="button">图片生成</button>
        <button type="button">空间多视角</button>
        <button type="button">多维相机调节</button>
      </div>
      <label>创作风格 ⌄ <select><option>无风格 · 无题材</option></select></label>
      <span>场景模式</span>
      <div class="segmented-row"><button class="active" type="button">● 生成模式</button><button type="button">● 360° 视界模式 <i>NEW</i></button></div>
    </div>
  `;
}

function renderPropGeneratorFields() {
  return `
    <div class="asset-generator-card">
      <label>创作风格 ⌄ <select><option>无风格 · 无题材</option></select></label>
    </div>
  `;
}

function renderAssetGeneratorPreviewColumn(title, assets) {
  return `
    <section class="asset-generator-preview-group">
      <header><span aria-hidden="true">▾</span>${title} (${assets.length})</header>
      <div class="asset-generator-preview-grid">
        ${assets.map((asset) => renderAssetGeneratorPreviewCard(asset)).join("")}
      </div>
    </section>
  `;
}

function renderAssetGeneratorPreviewCard(asset) {
  return `
    <article class="asset-generator-preview-card">
      <div class="asset-generator-preview-media">
        <img src="${escapeHtml(resolveApiUrl(asset.preview || asset.previewUrl || ""))}" alt="${escapeHtml(asset.name || "素材预览")}" />
      </div>
    </article>
  `;
}

function renderImportedAssetRenameModal(ui) {
  if (!ui.renameImportedAsset) {
    return "";
  }

  return `
    <section class="modal-backdrop rename-project-backdrop" role="dialog" aria-modal="true" aria-label="重命名素材">
      <div class="rename-project-modal asset-rename-modal">
        <div class="rename-project-head">
          <h2>重命名</h2>
          <button class="modal-close" type="button" data-action="close-rename-imported-asset-modal" aria-label="关闭">×</button>
        </div>
        <label class="rename-project-field">
          <input
            id="asset-rename-name-input"
            type="text"
            value="${escapeHtml(ui.renameImportedAssetName ?? "")}"
            placeholder="请输入素材名称"
          />
          <span class="rename-project-count asset-rename-count">${[...(ui.renameImportedAssetName ?? "")].length}/50</span>
        </label>
        <div class="rename-project-actions">
          <p class="modal-inline-status">${escapeHtml(ui.renameImportedAssetNotice ?? "")}</p>
          <div class="rename-project-button-row">
            <button class="secondary-action rename-cancel-button" type="button" data-action="close-rename-imported-asset-modal">取消</button>
            <button class="primary-action rename-save-button" type="button" data-action="confirm-rename-imported-asset">保存</button>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderEpisodeRenameModal(ui) {
  if (!ui.renameEpisodeId) {
    return "";
  }

  return `
    <section class="modal-backdrop rename-project-backdrop" role="dialog" aria-modal="true" aria-label="重命名剧集">
      <div class="rename-project-modal asset-rename-modal">
        <div class="rename-project-head">
          <h2>重命名</h2>
          <button class="modal-close" type="button" data-action="close-rename-episode-modal" aria-label="关闭">×</button>
        </div>
        <label class="rename-project-field">
          <input
            id="episode-rename-name-input"
            type="text"
            value="${escapeHtml(ui.renameEpisodeName ?? "")}"
            placeholder="请输入剧集名称"
          />
          <span class="rename-project-count asset-rename-count">${[...(ui.renameEpisodeName ?? "")].length}/50</span>
        </label>
        <div class="rename-project-actions">
          <p class="modal-inline-status">${escapeHtml(ui.renameEpisodeNotice ?? "")}</p>
          <div class="rename-project-button-row">
            <button class="secondary-action rename-cancel-button" type="button" data-action="close-rename-episode-modal">取消</button>
            <button class="primary-action rename-save-button" type="button" data-action="confirm-rename-episode-card">保存</button>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderEpisodeDeleteModal(ui) {
  if (!ui.deleteEpisodeId) {
    return "";
  }

  const episodeName =
    (ui.projectDetail?.episodes ?? []).find((episode) => episode.id === ui.deleteEpisodeId)?.title ?? "";

  return `
    <section class="modal-backdrop delete-project-backdrop" role="dialog" aria-modal="true" aria-label="确认删除剧集">
      <div class="delete-project-modal asset-delete-modal">
        <div class="delete-project-head">
          <div class="delete-project-icon">×</div>
          <div>
            <h2>确认删除</h2>
            <p>所选内容将被删除，确定删除${episodeName ? `“${escapeHtml(episodeName)}”` : ""}？</p>
          </div>
          <button class="modal-close" type="button" data-action="close-delete-episode-modal" aria-label="关闭">×</button>
        </div>
        <div class="delete-project-actions">
          <button class="secondary-action delete-cancel-button" type="button" data-action="close-delete-episode-modal">取消</button>
          <button class="delete-confirm-button" type="button" data-action="confirm-delete-episode-card">确定</button>
        </div>
      </div>
    </section>
  `;
}

function renderImportedAssetDeleteModal(ui) {
  if (!ui.deleteImportedAsset) {
    return "";
  }

  return `
    <section class="modal-backdrop delete-project-backdrop" role="dialog" aria-modal="true" aria-label="确认删除素材">
      <div class="delete-project-modal asset-delete-modal">
        <div class="delete-project-head">
          <div class="delete-project-icon">×</div>
          <div>
            <h2>确认删除</h2>
            <p>所选内容将被删除，确定删除${ui.deleteImportedAsset.name ? `“${escapeHtml(ui.deleteImportedAsset.name)}”` : ""}？</p>
          </div>
          <button class="modal-close" type="button" data-action="close-delete-imported-asset-modal" aria-label="关闭">×</button>
        </div>
        <div class="delete-project-actions">
          <button class="secondary-action delete-cancel-button" type="button" data-action="close-delete-imported-asset-modal">取消</button>
          <button class="delete-confirm-button" type="button" data-action="confirm-delete-imported-asset">确定</button>
        </div>
      </div>
    </section>
  `;
}

function getSelectedProjectCard(ui) {
  const selectedId = ui.selectedProjectCardId;
  if (!selectedId) {
    return null;
  }
  return ui.projectLibrary?.find((project) => project.id === selectedId) ?? null;
}

function normalizeProjectStatus(status) {
  if (status === "asset_review" || status === "shot_generation") {
    return "制作中";
  }
  if (status === "export") {
    return "一稿交付";
  }
  return String(status || "未开始");
}

function getStatusTone(status) {
  const normalized = normalizeProjectStatus(status);
  if (normalized === "制作中") {
    return "blue";
  }
  if (normalized === "一稿交付") {
    return "mint";
  }
  if (normalized === "完结") {
    return "green";
  }
  return "muted";
}

function renderInteriorAssetCard(label, kind, accent, count, previews = []) {
  return `
    <button
      class="interior-asset-card ${accent}"
      type="button"
      data-action="open-project-asset-tab"
      data-asset-kind="${kind}"
      aria-label="查看${label}资产"
    >
      <span class="asset-card-summary">
        <span class="asset-card-count">${count}</span>
        <span class="asset-card-label">${label} <b aria-hidden="true">→</b></span>
      </span>
      ${
        previews?.length
          ? `<span class="asset-card-preview-stack" aria-hidden="true">
              ${previews
                .slice(0, 3)
                .map((preview) => `<img src="${escapeHtml(resolveApiUrl(preview))}" alt="" />`)
                .join("")}
            </span>`
          : `<span class="comic-art ${kind}" aria-hidden="true"></span>`
      }
    </button>
  `;
}

function renderMainPanel({ state, ui, session, detailState, progress, activeNavTab }) {
  if (activeNavTab === "home") {
    return renderHomeHero({ detailState });
  }

  if (activeNavTab === "script") {
    return renderScrollableWorkbenchSurface("script", `
      ${renderScriptManagementPage({ state, ui })}
    `);
  }

  if (activeNavTab === "library") {
    return renderScrollableWorkbenchSurface("library", `
      ${renderWorkbenchHeader({ state, session, detailState, progress, ui, compact: true })}
      ${renderLibraryTeam({
        route: "assets",
        assetScope: ui.libraryTeamAssetScope,
        libraryCategory: ui.libraryCategory,
        libraryFolder: ui.libraryFolder,
        libraryQuery: ui.libraryQuery,
        libraryCategories: ui.libraryCategories,
        libraryFolders: ui.libraryFolders,
        libraryAssets: ui.libraryAssets,
        libraryEntitlement: ui.libraryEntitlement,
        teamAssetLocalUploads: ui.teamAssetLocalUploads,
        libraryLoading: ui.libraryLoading,
        libraryError: ui.libraryError,
        libraryDetailAssetId: ui.libraryDetailAssetId,
        libraryDetailView: ui.libraryDetailView,
        pricingOpen: Boolean(ui.isLibraryPricingModalOpen),
        billingPackages: ui.billingPackages ?? [],
        billingOrder: ui.lastBillingOrder ?? null,
        paymentIntent: ui.lastPaymentIntent ?? null,
        paymentAction: ui.lastPaymentAction ?? null,
        projectName: detailState.project.name,
        assetsByType: ui.projectLibraryAssetsByType ?? ui.importedAssets ?? null,
        searchQuery: ui.libraryAssetSearchQuery ?? "",
        typeFilter: ui.libraryAssetTypeFilter ?? "all",
        libraryCategory: ui.libraryCategory ?? "角色",
        libraryFolder: ui.libraryFolder ?? "国内仿真人-现代都市",
        selectedLibraryAssetId: ui.selectedLibraryAssetId ?? null,
        selectedLibraryImportIds: ui.selectedLibraryImportIds ?? [],
        members: ui.projectMembers ?? [],
        stats: ui.projectStats ?? null,
      })}
      ${renderWorkspaceStatusToast(ui.toast)}
    `);
  }

  if (activeNavTab === "tools") {
    return `
      ${renderToolsPanel(ui, state)}
      ${renderWorkspaceStatusToast(ui.toast)}
    `;
  }

  if (activeNavTab === "team") {
    return renderScrollableWorkbenchSurface("team", `
      ${renderWorkbenchHeader({ state, session, detailState, progress, ui })}
      ${renderLibraryTeam({
        route: ui.libraryTeamRoute ?? "team",
        pricingOpen: Boolean(ui.isLibraryPricingModalOpen),
        billingPackages: ui.billingPackages ?? [],
        billingOrder: ui.lastBillingOrder ?? null,
        paymentIntent: ui.lastPaymentIntent ?? null,
        paymentAction: ui.lastPaymentAction ?? null,
        rulesOpen: Boolean(ui.isMemberRulesModalOpen),
        createMemberModal: ui.createMemberModal ?? null,
        editMemberModal: ui.editMemberModal ?? null,
        dashboardTab: ui.teamDashboardTab ?? "member-consumption",
        dashboardDateShortcut: ui.teamDashboardDateShortcut ?? "今天",
        dashboardRoleFilter: ui.teamDashboardRoleFilter ?? "all",
        dashboardStatusFilter: ui.teamDashboardStatusFilter ?? "all",
        selectedDashboardMemberId: ui.selectedDashboardMemberId ?? null,
        projectName: detailState.project.name,
        members: ui.projectMembers ?? [],
        stats: ui.projectStats ?? null,
        memberSearchQuery: ui.teamMemberSearchQuery ?? "",
        memberRoleFilter: ui.teamMemberRoleFilter ?? "all",
        memberStatusFilter: ui.teamMemberStatusFilter ?? "all",
      })}
      ${renderWorkspaceStatusToast(ui.toast)}
    `);
  }

  if (activeNavTab === "project" && ui.projectPanelMode !== "workspace") {
    return renderProjectGallery({ ui });
  }

  return `
    ${renderWorkbenchHeader({ state, session, detailState, progress, ui })}
    <section id="overview" class="overview-strip" aria-label="项目总览">
      ${renderMetric("状态", detailState.project.statusLabel)}
      ${renderMetric("类型", detailState.project.type)}
      ${renderMetric("画幅", detailState.project.aspectRatio)}
      ${renderMetric("分辨率", detailState.project.resolution)}
    </section>
    <section class="episode-overview" aria-label="剧集概览">
      ${detailState.episodes
        .map(
          (episode) => `
            <article class="episode-card">
              <div>
                <p class="episode-title">${escapeHtml(episode.title)}</p>
                <p class="episode-meta">${escapeHtml(episode.status)} · ${episode.storyboardCount} 个分镜</p>
              </div>
              <button class="secondary-action compact" type="button" data-action="open-project-workspace">进入工作台</button>
            </article>
          `,
        ).join("")}
      <button id="confirm-assets-button" class="primary-action compact" type="button" data-action="confirm-all-assets" ${disabled(!state.assetCandidates || ui.busy)}>确认全部资产</button>
    </section>
    <section id="asset-prep-section" class="asset-section" aria-label="资产准备">
      <div class="section-heading">
        <div>
          <p class="section-kicker">资产准备</p>
          <h2>项目资产</h2>
        </div>
        <button id="confirm-assets-button" class="primary-action compact" type="button" data-action="confirm-all-assets" ${disabled(!state.assetCandidates || ui.busy)}>确认全部资产</button>
      </div>
      <div class="asset-lanes">
        ${GROUPS.map((group) => renderAssetCard(group, state, detailState, ui.busy)).join("")}
      </div>
    </section>
    ${renderEpisodeWorkbench({
      storyboards: ui.storyboards ?? [],
      selectedStoryboard: ui.selectedStoryboard,
      selectedStoryboardIds: ui.selectedStoryboardIds ?? [],
      isStoryboardDescriptionModalOpen: Boolean(ui.isStoryboardDescriptionModalOpen),
      storyboardDescriptionDraft: ui.storyboardDescriptionDraft ?? "",
      selectedModelId: ui.selectedModelId,
      prompt: resolveEpisodeWorkbenchPrompt(ui, ui.storyboards ?? []),
      busy: ui.busy,
      canParse: Boolean(state.project),
      canCalibrate: Boolean(state.assetReview?.readyForGeneration && state.shots?.length),
      canGenerateImages: Boolean(state.calibration && state.shots?.length),
      canGenerateVideos: Boolean(
        ui.selectedStoryboard?.imageStatus === "ready" ||
          state.shots?.some((shot) => shot.currentImageAssetVersionId),
      ),
      validationMessage: ui.validationMessage ?? "",
      calibrationSkipReason: ui.calibrationSkipReason ?? "",
      calibrationOverrideReason: ui.calibrationOverrideReason ?? "",
      imageGenerationResult: ui.imageGenerationResult ?? null,
      videoGenerationResult: ui.videoGenerationResult ?? null,
        assetImportModal: ui.assetImportModal ?? null,
        assetImportModalTab: ui.assetImportModalTab ?? "local",
        episodeAssetLibraryModal: ui.episodeAssetLibraryModal ?? null,
        episodeAssetLibraryCategory: ui.episodeAssetLibraryCategory ?? ui.projectAssetTab ?? "character",
        episodeAssetLibraryFolder: ui.episodeAssetLibraryFolder ?? "",
        episodeAssetLibraryQuery: ui.episodeAssetLibraryQuery ?? "",
        assetImportCategory: ui.assetImportCategory ?? "domestic-modern-city",
      assetImportDrafts: ui.assetImportDrafts ?? [],
      assetImportSelection: ui.assetImportSelection ?? [],
      assetImportPage: ui.assetImportPage ?? 1,
      assetImportPageSize: ui.assetImportPageSize ?? 10,
      assetImportPageSizeMenuOpen: Boolean(ui.assetImportPageSizeMenuOpen),
      assetImportOfficialAssets: ui.assetImportOfficialAssets ?? null,
      projectOtherAssetMediaType: ui.projectOtherAssetMediaType ?? "video",
      projectDetail: ui.projectDetail ?? null,
      mediaMode: ui.episodeMediaMode ?? "image",
      videoMode: ui.videoGenerationMode ?? "reference-video",
      imageMode: ui.imageGenerationMode ?? "single-image",
      generationControls: {
        videoDurationSec: ui.videoDurationSec,
        videoResolution: ui.videoResolution,
        videoCount: ui.videoCount,
        videoAudioEnabled: ui.videoAudioEnabled,
        videoMusicEnabled: ui.videoMusicEnabled,
        videoLipSyncEnabled: ui.videoLipSyncEnabled,
        imageCount: ui.imageCount,
        imageResolution: ui.imageResolution,
        imageAspectRatio: ui.imageAspectRatio,
        multiImageStrategy: ui.multiImageStrategy,
        parameterValues: ui.generationParameterValues ?? null,
      },
      episodeGenerationConfig: ui.episodeGenerationConfig ?? null,
      generationUiState: {
        isVideoModelMenuOpen: Boolean(ui.isVideoModelMenuOpen),
        openGenerationSelectMenu: ui.openGenerationSelectMenu ?? null,
        isFirstFrameMenuOpen: Boolean(ui.isFirstFrameMenuOpen),
        activeGenerationFrameMenu: ui.activeGenerationFrameMenu ?? null,
        isGenerationConsoleCollapsed: Boolean(ui.isGenerationConsoleCollapsed),
        imageGenerationMode: ui.imageGenerationMode ?? "single-image",
        videoGenerationMode: ui.videoGenerationMode ?? "reference-video",
        promptMentionMenuOpen: Boolean(ui.promptMentionMenuOpen),
        promptMentionQuery: ui.promptMentionQuery ?? "",
        promptMentionSuggestions: ui.promptMentionSuggestions ?? [],
        promptMentionPreviewOpen: Boolean(ui.promptMentionPreviewOpen),
        promptMentionPreviewAsset: ui.promptMentionPreviewAsset ?? null,
        lipSyncVoiceId: ui.lipSyncVoiceId ?? null,
        lipSyncVoiceName: ui.lipSyncVoiceName ?? "",
        lipSyncVoiceSource: ui.lipSyncVoiceSource ?? null,
        },
        storyboardDeleteTarget: ui.storyboardDeleteId ?? null,
        storyboardImageDeleteTarget: ui.storyboardImageDeleteTarget ?? null,
        storyboardVideoDeleteTarget: ui.storyboardVideoDeleteTarget ?? null,
        assetInspector: ui.assetInspector ?? null,
      })}
    ${renderExportPanel({
      exportPreview: state.exportPreview,
      exportHistory: ui.exportHistory ?? [],
      exportPreviewResult: ui.exportPreviewResult ?? null,
      busy: ui.busy,
      canPreview: Boolean(state.shots?.length),
    })}
    ${renderWorkspaceStatusToast(ui.toast)}
  `;
}

function renderWorkbenchHeader({ state, session, detailState, progress, ui, compact = false }) {
  return `
    <header class="workbench-topbar${compact ? " is-library-compact" : ""}">
      <div>
        <div class="project-title-row">
          <h1>${escapeHtml(detailState.project.name)}</h1>
          <span class="phase-pill">${escapeHtml(detailState.project.statusLabel)}</span>
        </div>
        <p class="session-line">当前账号 ${escapeHtml(session.user.phone)} · ${progress.readySteps}/${progress.totalSteps} 步完成</p>
      </div>
    </header>
  `;
}

function renderToolsPanel(ui = {}, state = {}) {
  if (ui.canvasProjectView !== "detail") {
    return renderCanvasProjectGallery(ui);
  }
  const canvasDocument = ui.canvasDocument ?? createDefaultCanvasDocument({
    projectId: ui.selectedProjectCardId ?? "",
    episodeId: ui.selectedEpisodeId ?? "",
  });
  const nodes = Array.isArray(canvasDocument.nodes) ? canvasDocument.nodes : [];
  const viewport = canvasDocument.viewport ?? {};
  const zoomPercent = Math.round(Number(viewport.zoom ?? 1) * 100);
  const viewportStyle = canvasViewportStyle(viewport);
  const gridStyle = canvasGridStyle(viewport);
  const sidebarMode = ui.canvasSidebarMode === "assets" ? "assets" : "nodes";
  const canvasAssets = Array.isArray(ui.canvasAssets) ? ui.canvasAssets : [];
  const sidebarItems = buildCanvasSidebarItems(canvasDocument, {
    mode: sidebarMode,
    assets: canvasAssets,
  });
  const nodeTemplates = resolveCanvasNodeTemplates(ui.episodeGenerationConfig);
  const selectedNode =
    nodes.find((node) => node.id === ui.selectedCanvasNodeId) ??
    null;
  const selectedModelOptionHtml = renderCanvasModelOptions(ui.episodeGenerationConfig, selectedNode);
  const selectedCanvasModelControls = renderCanvasModelParameterControls({
    generationConfig: ui.episodeGenerationConfig,
    node: selectedNode,
    parameterValues: resolveCanvasNodeParameterValues(selectedNode, ui),
    openMenu: ui.openGenerationSelectMenu,
  });
  const selectedCanvasModel = resolveSelectedCanvasModel(ui.episodeGenerationConfig, selectedNode);
  const generatingCanvasNodeId = String(ui.canvasGeneratingNodeId ?? "");
  const selectedNodeGenerating = selectedNode?.id && selectedNode.id === generatingCanvasNodeId;
  const addMenuOpen = ui.canvasAddMenuOpen === true;
  const contextMenu = ui.canvasContextMenu && typeof ui.canvasContextMenu === "object"
    ? ui.canvasContextMenu
    : null;
  const scriptPicker = resolveCanvasScriptPicker(ui, state);
  return `
    <section class="canvas-workspace" aria-label="画布" data-canvas-sidebar-mode="${escapeAttr(sidebarMode)}">
      <aside class="canvas-sidebar" aria-label="画布侧栏">
        <header class="canvas-sidebar-tabs" role="tablist" aria-label="画布资源切换">
          <button class="canvas-sidebar-tab ${sidebarMode === "nodes" ? "active" : ""}" type="button" role="tab" aria-selected="${sidebarMode === "nodes" ? "true" : "false"}" data-action="set-canvas-sidebar-mode" data-canvas-sidebar-mode="nodes">画布</button>
          <button class="canvas-sidebar-tab ${sidebarMode === "assets" ? "active" : ""}" type="button" role="tab" aria-selected="${sidebarMode === "assets" ? "true" : "false"}" data-action="set-canvas-sidebar-mode" data-canvas-sidebar-mode="assets">资产</button>
          <button class="canvas-sidebar-book" type="button" aria-label="打开画布说明">${renderCanvasIcon("book")}</button>
        </header>
        <div class="canvas-sidebar-filter">
          <button class="canvas-filter-label" type="button">
            <span>${sidebarMode === "assets" ? "项目素材" : "画布元素"}</span>
            <i aria-hidden="true">${renderCanvasIcon("sort")}</i>
          </button>
          <button class="canvas-filter-select" type="button">${sidebarMode === "assets" ? "可拖入" : "全部"}⌄</button>
          <button class="canvas-search" type="button" aria-label="搜索">${renderCanvasIcon("search")}</button>
        </div>
        <div class="canvas-element-list" aria-label="画布节点列表">
          ${sidebarItems.length
            ? sidebarItems.map((item) => renderCanvasSidebarItem(item, item.id === selectedNode?.id)).join("")
            : `<p class="canvas-empty-copy">${sidebarMode === "assets" ? "暂无可用素材，先在资产库导入角色、场景或参考图。" : "暂无画布节点。"}</p>`}
          <section class="canvas-template-section" aria-label="节点模板">
            <header>
              <span>节点模板</span>
              <small>${nodeTemplates.length} 个</small>
            </header>
            <div class="canvas-template-grid">
              ${nodeTemplates.map((template) => renderCanvasTemplateButton(template)).join("")}
            </div>
          </section>
        </div>
        <footer class="canvas-sidebar-footer">
          <button class="canvas-collapse" type="button" aria-label="收起侧栏">${renderCanvasIcon("collapse")}</button>
          <span>${sidebarMode === "assets" ? `共 ${sidebarItems.length} 素材` : `共 ${nodes.length} 节点`}</span>
        </footer>
      </aside>
      <main class="canvas-stage ${viewport.gridVisible === false ? "is-grid-hidden" : ""}" aria-label="自由生成画布" style="${escapeAttr(gridStyle)}">
        <button class="canvas-detail-back" type="button" data-action="back-to-canvas-projects" aria-label="返回画布项目列表">
          ${renderCanvasIcon("collapse")}<span>项目</span>
        </button>
        <div class="canvas-x6-mount" data-canvas-x6-mount aria-label="可拖拽连线画布"></div>
        <div class="canvas-flow" aria-label="AI 节点工作流" style="${escapeAttr(viewportStyle)}">
          ${renderLiblibCanvasEdges(canvasDocument)}
          ${nodes.map((node) => renderLiblibCanvasNode(node, {
            selected: node.id === selectedNode?.id,
            activeTextToolbar: ui.editingCanvasTextNodeId === node.id,
            canvasDocument,
            generatingNodeId: generatingCanvasNodeId,
          })).join("")}
          ${selectedNode && ui.canvasEditorOpen === true && !selectedNodeGenerating ? renderLiblibCanvasEditor(selectedNode, { modelOptionHtml: selectedModelOptionHtml, parameterControlHtml: selectedCanvasModelControls, canvasDocument, selectedModel: selectedCanvasModel }) : ""}
        </div>

        ${addMenuOpen ? `
          <aside class="canvas-add-menu" aria-label="添加节点">
            <p>节点模板</p>
            ${nodeTemplates.map((template) => `
              <button type="button" data-action="add-canvas-template" data-template-id="${escapeAttr(template.id)}" data-node-kind="${escapeAttr(template.type)}">
                ${renderCanvasIcon(template.type)}${escapeHtml(template.title)}
                ${template.group === "编排" ? "<span>NEW</span>" : ""}
              </button>
            `).join("")}
          </aside>
        ` : ""}

        ${contextMenu ? renderCanvasContextMenu(contextMenu, { episodeGenerationConfig: ui.episodeGenerationConfig }) : ""}

        ${scriptPicker ? renderCanvasScriptPicker(scriptPicker) : ""}

        <div class="canvas-zoom-tools" aria-label="画布视图工具">
          <button class="${viewport.gridVisible === false ? "" : "active"}" type="button" data-action="set-canvas-viewport" data-viewport-patch="toggle-grid" aria-label="网格视图">${renderCanvasIcon("grid")}</button>
          <button type="button" data-action="set-canvas-viewport" data-viewport-patch="zoom-out" aria-label="缩小">${renderCanvasIcon("minus")}</button>
          <button type="button" data-action="set-canvas-viewport" data-viewport-patch="zoom-in" aria-label="放大">${renderCanvasIcon("plus")}</button>
          <button class="${viewport.snapEnabled === false ? "" : "active"}" type="button" data-action="set-canvas-viewport" data-viewport-patch="toggle-snap" aria-label="吸附">${renderCanvasIcon("link")}</button>
          <strong>${escapeHtml(String(zoomPercent))}%</strong>
        </div>
      </main>
    </section>
  `;
}

function renderCanvasProjectGallery(ui = {}) {
  const projects = normalizeCanvasProjectCards(ui);
  return `
    <section class="canvas-project-gallery" aria-label="画布项目列表">
      <header class="canvas-project-gallery-head">
        <h1>全部画布(${escapeHtml(String(projects.length))})</h1>
        <div class="canvas-project-gallery-controls">
          <button class="canvas-project-filter" type="button">
            <span>项目状态</span>
            <i aria-hidden="true">⌄</i>
          </button>
          <label class="canvas-project-search">
            ${renderCanvasIcon("search")}
            <input type="search" placeholder="请输入项目名称" aria-label="请输入项目名称" />
          </label>
        </div>
      </header>
      <div class="canvas-project-card-grid">
        ${projects.map((project) => renderCanvasProjectCard(project, ui.canvasProjectMenuId === project.id)).join("")}
      </div>
      <div class="canvas-project-aurora" aria-hidden="true"></div>
      <button class="canvas-create-project-button" type="button" data-action="create-canvas-project">
        <span aria-hidden="true">${renderCanvasIcon("plus")}</span>
        创建画布
      </button>
    </section>
  `;
}

function normalizeCanvasProjectCards(ui = {}) {
  const fallback = [{ id: "canvas-project-main", title: "画布项目", createdAt: "2026/06/10", status: "草稿" }];
  const projects = Array.isArray(ui.canvasProjects) && ui.canvasProjects.length ? ui.canvasProjects : fallback;
  return projects.map((project, index) => ({
    id: String(project?.id ?? `canvas-project-${index + 1}`),
    title: String(project?.title ?? (index === 0 ? "画布项目" : `画布项目 ${index + 1}`)),
    createdAt: String(project?.createdAt ?? "2026/06/10"),
    status: String(project?.status ?? "草稿"),
  }));
}

function renderCanvasProjectCard(project = {}, menuOpen = false) {
  return `
    <article class="canvas-project-card">
      <button class="canvas-project-card-open" type="button" data-action="open-canvas-project" data-canvas-project-id="${escapeAttr(project.id ?? "")}" aria-label="打开${escapeAttr(project.title ?? "画布项目")}">
        <span class="canvas-project-cover" aria-hidden="true">
          <span class="canvas-project-play">${renderCanvasIcon("video")}</span>
        </span>
      </button>
      <div class="canvas-project-card-copy">
        <button class="canvas-project-title" type="button" data-action="open-canvas-project" data-canvas-project-id="${escapeAttr(project.id ?? "")}" aria-label="打开${escapeAttr(project.title ?? "画布项目")}">
          <strong>${escapeHtml(project.title ?? "画布项目")}</strong>
        </button>
        <div class="canvas-project-card-row">
          <small>创建时间：${escapeHtml(project.createdAt ?? "2026/06/10")}</small>
          <span class="canvas-project-card-actions">
            <button class="canvas-project-menu" type="button" data-action="toggle-canvas-project-menu" data-canvas-project-id="${escapeAttr(project.id ?? "")}" aria-label="${escapeAttr(project.title ?? "画布项目")}编辑">编辑</button>
            ${menuOpen ? renderCanvasProjectMenu(project) : ""}
          </span>
        </div>
      </div>
    </article>
  `;
}

function renderCanvasProjectMenu(project = {}) {
  return `
    <div class="canvas-project-card-menu" role="menu" aria-label="画布操作">
      <button class="canvas-project-card-menu-item" type="button" data-action="rename-canvas-project" data-canvas-project-id="${escapeAttr(project.id ?? "")}">重命名</button>
      <button class="canvas-project-card-menu-item danger" type="button" data-action="delete-canvas-project" data-canvas-project-id="${escapeAttr(project.id ?? "")}">删除</button>
    </div>
  `;
}

function renderCanvasSidebarItem(item, active = false) {
  const action = item.type === "asset" ? "add-canvas-template" : "select-canvas-node";
  const dataAttrs = item.type === "asset"
    ? `data-template-id="template-upload" data-node-kind="upload" data-asset-id="${escapeAttr(item.id)}"`
    : `data-node-id="${escapeAttr(item.id)}" data-node-kind="${escapeAttr(item.kind)}"`;
  return `
    <button class="canvas-element-item ${escapeAttr(item.kind)} ${item.type === "asset" ? "asset" : ""} ${active ? "active" : ""}" type="button" data-action="${action}" ${dataAttrs}>
      <span class="canvas-element-icon" aria-hidden="true">${item.url ? `<img src="${escapeAttr(item.url)}" alt="" loading="lazy" />` : renderCanvasIcon(item.kind)}</span>
      <span class="canvas-element-copy">
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.meta)}</small>
      </span>
      <i>${escapeHtml(item.status)}</i>
    </button>
  `;
}

function renderCanvasTemplateButton(template) {
  return `
    <button class="canvas-template-button ${escapeAttr(template.type)}" type="button" data-action="add-canvas-template" data-template-id="${escapeAttr(template.id)}" data-node-kind="${escapeAttr(template.type)}">
      <span aria-hidden="true">${renderCanvasIcon(template.type)}</span>
      <strong>${escapeHtml(template.title)}</strong>
      <small>${escapeHtml(template.description)}</small>
    </button>
  `;
}

function renderLiblibCanvasEdges(document = {}) {
  const nodes = Array.isArray(document.nodes) ? document.nodes : [];
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const edges = Array.isArray(document.edges) ? document.edges : [];
  const edgePaths = edges
    .map((edge) => {
      const sourceNode = nodeMap.get(edge.sourceNodeId);
      const targetNode = nodeMap.get(edge.targetNodeId);
      if (!sourceNode || !targetNode) {
        return "";
      }
      const source = canvasPortAnchor(sourceNode, "out");
      const target = canvasPortAnchor(targetNode, "in");
      const delta = Math.max(110, Math.abs(target.x - source.x) * 0.48);
      const d = `M ${source.x} ${source.y} C ${source.x + delta} ${source.y}, ${target.x - delta} ${target.y}, ${target.x} ${target.y}`;
      const active = edge?.data?.status === "running" || edge?.data?.status === "preview" || edge?.data?.status === "queued";
      return `
        <g
          class="canvas-flow-edge ${active ? "active" : ""}"
          data-canvas-edge-id="${escapeAttr(edge.id ?? "")}"
          data-source-node-id="${escapeAttr(edge.sourceNodeId ?? "")}"
          data-source-port-id="${escapeAttr(edge.sourcePortId ?? "")}"
          data-target-node-id="${escapeAttr(edge.targetNodeId ?? "")}"
          data-target-port-id="${escapeAttr(edge.targetPortId ?? "")}"
        >
          <path class="canvas-flow-edge-hit" d="${escapeAttr(d)}" />
          <path class="canvas-flow-edge-line" d="${escapeAttr(d)}" />
          <path class="canvas-flow-edge-glow" d="${escapeAttr(d)}" />
        </g>
      `;
    })
    .join("");
  return `
    <svg class="canvas-lib-edge-layer" viewBox="-3200 -2400 6400 4800" aria-hidden="true">
      ${edgePaths}
    </svg>
  `;
}

function renderLiblibCanvasNode(node, options = {}) {
  if (node?.type === "script") {
    return renderLiblibTextNode(node, options);
  }
  if (node?.type === "upload") {
    return renderLiblibUploadNode(node, options);
  }
  if (node?.type === "send") {
    return renderLiblibGenerationNode(node, options);
  }
  if (node?.type === "video") {
    return renderLiblibGenerationNode({
      ...node,
      data: {
        ...(node.data ?? {}),
        mediaKind: "video",
      },
    }, options);
  }
  if (node?.type === "image") {
    return renderLiblibGenerationNode({
      ...node,
      data: {
        ...(node.data ?? {}),
        mediaKind: "image",
      },
    }, options);
  }
  return renderLiblibTextNode(node, options);
}

function renderLiblibUploadNode(node, { selected = false } = {}) {
  const title = node?.data?.title && !String(node.data.title).includes("�")
    ? node.data.title
    : "上传";
  const mediaKind = node?.data?.mediaKind === "video" ? "video" : "image";
  const mediaUrl = node?.data?.url ?? node?.data?.previewUrl ?? node?.data?.src ?? "";
  const fileName = node?.data?.fileName ?? node?.data?.name ?? "";
  const status = node?.data?.status ?? "empty";
  const style = canvasNodePositionStyle(node, { width: 360, height: 220 });
  return `
    <article
      class="canvas-lib-node canvas-upload-node ${selected ? "selected" : ""}"
      data-action="select-canvas-node"
      data-canvas-node-id="${escapeAttr(node?.id ?? "")}"
      data-node-id="${escapeAttr(node?.id ?? "")}"
      data-node-kind="upload"
      style="${escapeAttr(style)}"
    >
      <header class="canvas-lib-node-title">
        ${renderCanvasIcon("upload")}
        <strong>${escapeHtml(title)}</strong>
      </header>
      <button class="canvas-upload-card ${mediaUrl ? "has-media" : ""}" type="button" data-action="pick-canvas-upload-file" data-node-id="${escapeAttr(node?.id ?? "")}">
        <span class="canvas-node-connect right" data-node-id="${escapeAttr(node?.id ?? "")}" data-port-direction="out" data-port-id="${escapeAttr(firstCanvasPortId(node, "outputs"))}" aria-hidden="true">+</span>
        ${mediaUrl ? `
          <span class="canvas-upload-preview">
            ${mediaKind === "video"
              ? `<video src="${escapeAttr(mediaUrl)}" muted playsinline preload="metadata"></video>`
              : `<img src="${escapeAttr(mediaUrl)}" alt="" loading="lazy" />`}
          </span>
          <span class="canvas-upload-meta">
            <strong>${escapeHtml(fileName || (mediaKind === "video" ? "视频素材" : "图片素材"))}</strong>
            <small>${status === "uploading" ? "上传中" : "已选择"}</small>
          </span>
        ` : `
          <span class="canvas-upload-empty-icon" aria-hidden="true">${renderCanvasIcon("upload")}</span>
          <span class="canvas-upload-empty-text">上传图片或视频</span>
        `}
        <input class="canvas-upload-file-input" type="file" accept="image/*,video/*" data-canvas-upload-input data-node-id="${escapeAttr(node?.id ?? "")}" tabindex="-1" aria-hidden="true" />
      </button>
    </article>
  `;
}

function renderLiblibGenerationNode(node, { selected = false, canvasDocument = null, generatingNodeId = "" } = {}) {
  const mediaKind = node?.data?.mediaKind === "video" || node?.type === "video" ? "video" : "image";
  const title = mediaKind === "video" ? "视频生成" : "图片生成";
  const promptLabel = mediaKind === "video" ? "输入提示词生成视频" : "输入提示词生成图片";
  const style = canvasNodePositionStyle(node, mediaKind === "video" ? { width: 420, height: 378 } : { width: 420, height: 378 });
  const mediaUrl = resolveCanvasGenerationNodeMediaUrl(node, mediaKind);
  const progress = resolveCanvasGenerationNodeProgress(node);
  const progressStage = resolveCanvasGenerationNodeStage(node);
  const progressTaskId = resolveCanvasGenerationNodeTaskId(node);
  const isGenerating = String(node?.id ?? "") === String(generatingNodeId ?? "");
  return `
    <article
      class="canvas-lib-node canvas-generation-node ${mediaKind} ${selected ? "selected" : ""} ${isGenerating ? "is-generating" : ""}"
      ${isGenerating ? 'aria-disabled="true"' : 'data-action="select-canvas-node"'}
      data-canvas-node-id="${escapeAttr(node?.id ?? "")}"
      data-node-id="${escapeAttr(node?.id ?? "")}"
      data-node-kind="${escapeAttr(node?.type ?? "send")}"
      style="${escapeAttr(style)}"
    >
      <header class="canvas-lib-node-title">
        ${renderCanvasIcon(mediaKind)}
        <strong>${title}</strong>
      </header>
      <div class="canvas-generation-preview">
        <span class="canvas-node-connect left" data-node-id="${escapeAttr(node?.id ?? "")}" data-port-direction="in" data-port-id="${escapeAttr(firstCanvasPortId(node, "inputs"))}" aria-hidden="true">+</span>
        <span class="canvas-node-connect right" data-node-id="${escapeAttr(node?.id ?? "")}" data-port-direction="out" data-port-id="${escapeAttr(firstCanvasPortId(node, "outputs"))}" aria-hidden="true">+</span>
        ${mediaUrl ? `
          ${renderCanvasGenerationResult(node, mediaKind, mediaUrl, isGenerating)}
        ` : isGenerating ? "" : `
          <div class="canvas-generation-empty">
            ${renderCanvasIcon(mediaKind)}
            <strong>${promptLabel}</strong>
          </div>
        `}
        ${isGenerating ? renderCanvasGenerationProgress(progress, progressStage, progressTaskId) : ""}
      </div>
    </article>
  `;
}

function renderCanvasGenerationResult(node, mediaKind, mediaUrl, isGenerating = false) {
  const resultClass = `canvas-generation-result ${isGenerating ? "is-generating" : ""}`;
  if (mediaKind === "video") {
    const fileName = resolveCanvasGeneratedMediaFileName(node, mediaKind, mediaUrl);
    return `
      <div class="${resultClass}">
        <video class="canvas-generation-video" src="${escapeAttr(mediaUrl)}" controls playsinline preload="metadata"></video>
        <div class="canvas-generation-result-actions">
          <a class="canvas-generation-result-action" href="${escapeAttr(mediaUrl)}" download="${escapeAttr(fileName)}" target="_blank" rel="noopener" aria-label="下载生成视频" title="下载生成视频">
            ${renderCanvasIcon("download")}
            <span>下载</span>
          </a>
        </div>
      </div>
    `;
  }

  return `
    <div class="${resultClass}">
      <img src="${escapeAttr(mediaUrl)}" alt="" loading="lazy" />
    </div>
  `;
}

function resolveCanvasGeneratedMediaFileName(node, mediaKind, mediaUrl = "") {
  const data = node?.data ?? {};
  const baseName = String(
    data.fileName ??
    data.name ??
    data.title ??
    data.lastTaskId ??
    node?.id ??
    (mediaKind === "video" ? "canvas-video" : "canvas-image"),
  ).trim();
  const safeBaseName = (baseName || (mediaKind === "video" ? "canvas-video" : "canvas-image"))
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .slice(0, 80);
  const extensionMatch = String(mediaUrl ?? "").split(/[?#]/)[0].match(/\.([a-z0-9]{2,5})$/i);
  const extension = extensionMatch?.[1] ?? (mediaKind === "video" ? "mp4" : "png");
  return `${safeBaseName}.${extension}`;
}

function renderCanvasGenerationProgress(progress, stage = "", taskId = "") {
  const percent = Math.max(0, Math.min(100, Math.round(Number(progress) || 0)));
  const stageLabel = canvasGenerationStageLabel(stage, percent);
  const shortTaskId = shortCanvasTaskId(taskId);
  return `
    <div class="canvas-generation-progress" aria-label="生成进度 ${percent}%">
      <span class="canvas-generation-progress-kicker">任务已发送</span>
      <span class="canvas-generation-progress-label">生成中 ${percent}%</span>
      ${shortTaskId ? `<span class="canvas-generation-progress-task" title="${escapeAttr(taskId)}">任务ID ${escapeHtml(shortTaskId)}</span>` : ""}
      <span class="canvas-generation-progress-stage">${escapeHtml(stageLabel)}</span>
      <span class="canvas-generation-progress-track"><i style="width:${percent}%"></i></span>
    </div>
  `;
}

function resolveCanvasGenerationNodeProgress(node) {
  const rawValue = node?.data?.generationProgress ?? node?.data?.progress;
  const value = Number(rawValue);
  if (Number.isFinite(value)) {
    return value;
  }
  const status = String(node?.data?.status ?? "").toLowerCase();
  if (status === "running") return 55;
  if (status === "queued") return 12;
  return 0;
}

function resolveCanvasGenerationNodeStage(node) {
  return String(node?.data?.generationStage ?? node?.data?.progressStage ?? node?.data?.progress_stage ?? node?.data?.stage ?? "").trim();
}

function resolveCanvasGenerationNodeTaskId(node) {
  const data = node?.data ?? {};
  const value = data.lastTaskId ?? data.taskId ?? data.generationTaskId ?? data.platform?.tasks?.[0]?.taskId ?? "";
  return String(value ?? "").trim();
}

function shortCanvasTaskId(taskId) {
  const value = String(taskId ?? "").trim();
  if (!value) return "";
  return value.length > 14 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function canvasGenerationStageLabel(stage, percent) {
  const normalized = String(stage ?? "").trim().toLowerCase();
  if (["queue_unavailable", "queue_stalled", "queued_unprocessed"].includes(normalized)) return "生成队列未处理，请检查 Redis、outbox 和 worker";
  if (["queued", "submitted", "created"].includes(normalized)) return "任务已入库，等待队列投递到模型";
  if (["provider_submitted", "provider_accepted", "accepted"].includes(normalized)) return "模型已接收，正在排队";
  if (["provider_rendering", "provider_running", "rendering", "running", "processing"].includes(normalized)) return "模型正在生成画面";
  if (["provider_succeeded", "provider_completed"].includes(normalized)) return "模型已返回，正在整理结果";
  if (["saving_asset", "persisting_asset", "uploading_asset"].includes(normalized)) return "正在保存结果到素材库";
  if (["completed", "succeeded"].includes(normalized) || percent >= 100) return "生成完成，正在刷新画布";
  return percent <= 12 ? "任务已发送，等待进度回传" : "正在同步生成状态";
}

function resolveCanvasGenerationNodeMediaUrl(node, mediaKind) {
  const data = node?.data ?? {};
  const candidates = mediaKind === "video"
    ? [data.videoUrl, data.resultVideoUrl, data.resultUrl, data.url, data.assetUrl, data.downloadUrl, data.sourceUrl, data.previewUrl, data.thumbnailUrl]
    : [data.previewUrl, data.resultUrl, data.url, data.imageUrl, data.assetUrl, data.thumbnailUrl];
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (value) {
      return value;
    }
  }
  return "";
}

function resolveCanvasUploadReferences(document, targetNodeId) {
  const nodes = Array.isArray(document?.nodes) ? document.nodes : [];
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  return (Array.isArray(document?.edges) ? document.edges : [])
    .filter((edge) => edge.targetNodeId === targetNodeId)
    .flatMap((edge) => resolveCanvasReferenceImagesForNode(nodeMap.get(edge.sourceNodeId), document))
    .filter((item, index, items) => item.url && items.findIndex((candidate) => candidate.url === item.url) === index)
    .filter((item) => item.url);
}

function resolveCanvasReferenceImagesForNode(node, document = {}) {
  const direct = resolveCanvasReferenceImage(node);
  if (direct.url) {
    return [direct];
  }
  if (!(node?.type === "image" || node?.data?.mediaKind === "image")) {
    return [];
  }
  const nodes = Array.isArray(document?.nodes) ? document.nodes : [];
  const nodeMap = new Map(nodes.map((item) => [item.id, item]));
  return (Array.isArray(document?.edges) ? document.edges : [])
    .filter((edge) => edge.targetNodeId === node.id)
    .map((edge) => resolveCanvasReferenceImage(nodeMap.get(edge.sourceNodeId)))
    .filter((item) => item.url);
}

function resolveCanvasReferenceImage(node) {
  if (!node) {
    return { id: "", name: "", url: "" };
  }
  if (node.type === "upload" && (node.data?.mediaKind ?? "image") !== "video") {
    return {
      id: String(node.id ?? ""),
      name: String(node.data?.fileName ?? node.data?.name ?? "参考图"),
      url: String(node.data?.previewUrl ?? node.data?.url ?? node.data?.src ?? ""),
    };
  }
  if (node.type === "image" || node.data?.mediaKind === "image") {
    return {
      id: String(node.id ?? ""),
      name: String(node.data?.fileName ?? node.data?.name ?? node.data?.title ?? "参考图"),
      url: String(
        node.data?.previewUrl ??
        node.data?.url ??
        node.data?.src ??
        node.data?.imageUrl ??
        node.data?.resultUrl ??
        node.data?.assetUrl ??
        node.data?.thumbnailUrl ??
        "",
      ),
    };
  }
  return { id: "", name: "", url: "" };
}

function renderCanvasGenerationReferences(references = []) {
  return `
    <div class="canvas-generation-references" aria-label="连接的参考图片">
      ${references.map((item) => `
        <span class="canvas-generation-reference-thumb" title="${escapeAttr(item.name)}">
          <img src="${escapeAttr(item.url)}" alt="" loading="lazy" />
        </span>
      `).join("")}
    </div>
  `;
}

function renderLiblibTextNode(node, { selected = false, activeTextToolbar = false } = {}) {
  const title = resolveCanvasTextNodeTitle(node);
  const hasContent = Boolean(String(node?.data?.textHtml ?? node?.data?.text ?? "").trim());
  const inlineText = activeTextToolbar || hasContent;
  const style = canvasNodePositionStyle(node, { width: 310, height: 300 });
  return `
    <article
      class="canvas-lib-node canvas-text-node ${inlineText ? "is-text-editing" : ""} ${activeTextToolbar ? "is-toolbar-active" : ""} ${selected ? "selected" : ""}"
      ${inlineText ? "" : 'data-action="select-canvas-node"'}
      data-canvas-node-id="${escapeAttr(node?.id ?? "")}"
      data-node-id="${escapeAttr(node?.id ?? "")}"
      data-node-kind="${escapeAttr(node?.type ?? "script")}"
      style="${escapeAttr(style)}"
    >
      <header class="canvas-lib-node-title">
        ${renderCanvasIcon("text")}
        <strong>${escapeHtml(title)}</strong>
      </header>
      <div class="canvas-text-card">
        <span class="canvas-node-connect left" data-node-id="${escapeAttr(node?.id ?? "")}" data-port-direction="in" data-port-id="${escapeAttr(firstCanvasPortId(node, "inputs"))}" aria-hidden="true">+</span>
        <span class="canvas-node-connect right" data-node-id="${escapeAttr(node?.id ?? "")}" data-port-direction="out" data-port-id="${escapeAttr(firstCanvasPortId(node, "outputs"))}" aria-hidden="true">+</span>
        ${inlineText ? renderInlineCanvasTextEditor(node, { toolbar: activeTextToolbar }) : `
          <div class="canvas-text-glyph" aria-hidden="true">
            <i></i><i></i><i></i><i></i>
          </div>
          <div class="canvas-text-tries">
            <span>尝试:</span>
            <button type="button" data-action="edit-canvas-text-node" data-node-id="${escapeAttr(node?.id ?? "")}">${renderCanvasIcon("text")}自己编写内容</button>
            <button type="button" data-action="open-canvas-script-picker" data-node-id="${escapeAttr(node?.id ?? "")}">${renderCanvasIcon("book")}剧本</button>
          </div>
        `}
        ${inlineText ? `<span class="canvas-node-resize-handle" data-canvas-node-resize-handle data-node-id="${escapeAttr(node?.id ?? "")}" aria-hidden="true"></span>` : ""}
      </div>
    </article>
  `;
}

function renderInlineCanvasTextEditor(node, { toolbar: showToolbar = true } = {}) {
  const nodeId = node?.id ?? "";
  const html = node?.data?.textHtml ? String(node.data.textHtml) : canvasTextToHtml(node?.data?.text ?? "");
  const title = resolveCanvasTextNodeTitle(node);
  const toolbarItems = [
    ["clear-format", "clear-format"],
    ["heading-1", "H1"],
    ["heading-2", "H2"],
    ["heading-3", "H3"],
    ["paragraph", "paragraph"],
    ["bold", "B"],
    ["italic", "italic"],
    ["bullet", "list"],
    ["numbered", "ordered-list"],
    ["divider", "divider"],
  ];
  return `
    ${showToolbar ? `<div class="canvas-text-format-toolbar" aria-label="文本格式工具条">
      ${toolbarItems.map(([command, label]) => `
        <button type="button" data-action="format-canvas-text-node" data-node-id="${escapeAttr(nodeId)}" data-format-command="${escapeAttr(command)}" aria-label="${escapeAttr(label)}" onmousedown="event.preventDefault()">${renderCanvasToolbarLabel(label)}</button>
      `).join("")}
    </div>` : ""}
    <div class="canvas-inline-editor-title" data-canvas-node-drag-handle data-node-id="${escapeAttr(nodeId)}" aria-hidden="true">${renderCanvasIcon("text")}<span>${escapeHtml(title)}</span></div>
    <div
      class="canvas-inline-richtext"
      role="textbox"
      contenteditable="true"
      aria-label="节点内容"
      data-canvas-text-input
      data-node-id="${escapeAttr(nodeId)}"
      data-placeholder="输入内容..."
    >${sanitizeCanvasTextHtml(html)}</div>
  `;
}

function resolveCanvasTextNodeTitle(node) {
  const source = String(node?.data?.source ?? "");
  return node?.type === "script" || source === "project_script" || source === "project_script_episode"
    ? "剧本源"
    : "文本源";
}

function renderCanvasToolbarLabel(label) {
  const icons = {
    "clear-format": '<span class="canvas-toolbar-clear-mark"></span>',
    italic: '<span class="canvas-toolbar-italic" aria-hidden="true">I</span>',
    paragraph: '<span class="canvas-toolbar-paragraph">¶</span>',
    list: '<span class="canvas-toolbar-list"><i></i><i></i><i></i></span>',
    "ordered-list": '<span class="canvas-toolbar-ordered"><i></i><i></i><i></i></span>',
    divider: '<span class="canvas-toolbar-divider-line"></span>',
    copy: renderCanvasIcon("copy"),
    fullscreen: renderCanvasIcon("fullscreen"),
  };
  return icons[label] ?? escapeHtml(label);
}

function canvasTextToHtml(text) {
  const value = String(text ?? "");
  if (!value.trim()) {
    return "";
  }
  return value
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function sanitizeCanvasTextHtml(html) {
  const value = String(html ?? "");
  return value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/\sstyle\s*=\s*(['"]).*?\1/gi, "")
    .replace(/javascript:/gi, "");
}

function firstCanvasPortId(node, direction) {
  const ports = direction === "inputs" ? node?.data?.ports?.inputs : node?.data?.ports?.outputs;
  return Array.isArray(ports) ? ports[0]?.id ?? "" : "";
}

function canvasVisualNodeSize(node) {
  if (Number.isFinite(Number(node?.size?.width)) && Number.isFinite(Number(node?.size?.height))) {
    return {
      width: Number(node.size.width),
      height: Number(node.size.height),
    };
  }
  if (node?.type === "script" || node?.type === "director" || node?.data?.mediaKind === "text") {
    return { width: 310, height: 300 };
  }
  return { width: 420, height: 378 };
}

function canvasPortAnchor(node, direction) {
  const size = canvasVisualNodeSize(node);
  const x = Number(node?.position?.x ?? 0);
  const y = Number(node?.position?.y ?? 0);
  return {
    x: Math.round(direction === "out" ? x + size.width + 30 : x - 30),
    y: Math.round(y + (size.height / 2)),
  };
}

function renderLiblibCanvasEditor(node, { modelOptionHtml = "", parameterControlHtml = "", canvasDocument = {}, selectedModel = null } = {}) {
  if (node?.type === "upload" || node?.type === "script" || node?.type === "director" || node?.data?.mediaKind === "text") {
    return "";
  }
  return renderLiblibGenerationEditor(node, { modelOptionHtml, parameterControlHtml, canvasDocument, selectedModel });
}

function resolveSelectedCanvasModel(generationConfig = {}, node = null) {
  if (!node || node.type === "script" || node.type === "director" || node.data?.mediaKind === "text") {
    return null;
  }
  const mediaKind = node?.data?.mediaKind === "video" || node?.type === "video" ? "video" : "image";
  const videoMode = mediaKind === "video" ? resolveCanvasVideoGenerationMode(node) : "";
  const modelOptions = resolveCanvasModelOptions(generationConfig, mediaKind)
    .filter((model) => mediaKind !== "video" || canvasModelMatchesVideoMode(model.raw, videoMode));
  const nodeModelCode = String(node?.data?.modelCode ?? "").trim();
  const selectedModelCode = modelOptions.some((model) => model.modelCode === nodeModelCode)
    ? nodeModelCode
    : String(modelOptions[0]?.modelCode ?? nodeModelCode).trim();
  return modelOptions.find((model) => model.modelCode === selectedModelCode)?.raw ?? null;
}

function renderCanvasModelOptions(generationConfig = {}, node = null) {
  if (!node || node.type === "script" || node.type === "director" || node.data?.mediaKind === "text") {
    return "";
  }
  const mediaKind = node?.data?.mediaKind === "video" || node?.type === "video" ? "video" : "image";
  const videoMode = mediaKind === "video" ? resolveCanvasVideoGenerationMode(node) : "";
  const modelOptions = resolveCanvasModelOptions(generationConfig, mediaKind)
    .filter((model) => mediaKind !== "video" || canvasModelMatchesVideoMode(model.raw, videoMode));
  const nodeModelCode = String(node?.data?.modelCode ?? "").trim();
  const selectedModelCode = modelOptions.some((model) => model.modelCode === nodeModelCode)
    ? nodeModelCode
    : String(modelOptions[0]?.modelCode ?? nodeModelCode).trim();
  if (!modelOptions.length) {
    return `<option value="${escapeAttr(selectedModelCode)}">${escapeHtml(selectedModelCode || "后台未配置模型")}</option>`;
  }
  return modelOptions
    .map((model) => `
      <option value="${escapeAttr(model.modelCode)}" ${model.modelCode === selectedModelCode ? "selected" : ""}>${escapeHtml(model.modelLabel)}</option>
    `)
    .join("");
}

function renderCanvasModelParameterControls({ generationConfig = {}, node = null, parameterValues = {}, openMenu = "" } = {}) {
  if (!node || node.type === "script" || node.type === "director" || node.data?.mediaKind === "text") {
    return "";
  }
  const mediaKind = node?.data?.mediaKind === "video" || node?.type === "video" ? "video" : "image";
  const videoMode = mediaKind === "video" ? resolveCanvasVideoGenerationMode(node) : "";
  const modelOptions = resolveCanvasModelOptions(generationConfig, mediaKind)
    .filter((model) => mediaKind !== "video" || canvasModelMatchesVideoMode(model.raw, videoMode));
  const nodeModelCode = String(node?.data?.modelCode ?? "").trim();
  const selectedModelCode = modelOptions.some((model) => model.modelCode === nodeModelCode)
    ? nodeModelCode
    : String(modelOptions[0]?.modelCode ?? nodeModelCode).trim();
  const selectedModel = modelOptions.find((model) => model.modelCode === selectedModelCode)?.raw ?? null;
  return buildCanvasParameterControls({
    selectedModel,
    mediaKind,
    parameterValues,
    openMenu,
    nodeId: node?.id ?? "",
  });
}

function buildCanvasParameterControls({ selectedModel = null, mediaKind = "image", parameterValues = {}, openMenu = "", nodeId = "" } = {}) {
  const schema = selectedModel?.parameterSchema && typeof selectedModel.parameterSchema === "object" && !Array.isArray(selectedModel.parameterSchema)
    ? selectedModel.parameterSchema
    : {};
  const entries = Object.entries(schema)
    .filter(([key, parameter]) => shouldRenderCanvasParameterControl(key, parameter));
  if (entries.length) {
    return entries
      .map(([key, parameter]) => {
        const options = canvasOptionPairsFromParameter(parameter);
        if (!options.length) {
          return "";
        }
        const value = resolveCanvasParameterValue(key, {
          parameter,
          options,
          selectedModel,
          parameterValues,
          mediaKind,
        });
        return renderCanvasParameterMenu(
          key,
          canvasParameterLabel(value, options),
          openMenu,
          options,
          parameter?.label ?? key,
          nodeId,
        );
      })
      .filter(Boolean)
      .join("");
  }
  const isVideo = mediaKind === "video";
  const defaults = selectedModel?.defaultParams && typeof selectedModel.defaultParams === "object" ? selectedModel.defaultParams : {};
  const ratioOptions = canvasOptionPairsFromValues(selectedModel?.supportedRatios, isVideo ? ["16:9", "9:16"] : ["16:9", "9:16", "1:1"]);
  const qualityOptions = canvasOptionPairsFromValues(selectedModel?.supportedQuality, isVideo ? ["1080p"] : ["2K"]);
  const durationOptions = canvasOptionPairsFromValues(selectedModel?.supportedDurations, ["5", "10"], (value) => `${value}秒`);
  const ratio = firstCanvasParameterValue(parameterValues.aspectRatio, parameterValues.imageAspectRatio, defaults.aspectRatio, ratioOptions[0]?.[0]);
  const quality = firstCanvasParameterValue(
    isVideo ? parameterValues.resolution : parameterValues.quality,
    isVideo ? parameterValues.videoResolution : parameterValues.imageResolution,
    defaults.resolution,
    defaults.quality,
    qualityOptions[0]?.[0],
  );
  const duration = firstCanvasParameterValue(parameterValues.durationSec, parameterValues.videoDurationSec, defaults.durationSec, durationOptions[0]?.[0]);
  return [
    renderCanvasParameterMenu("aspectRatio", ratio, openMenu, ratioOptions, "比例", nodeId),
    renderCanvasParameterMenu(isVideo ? "resolution" : "quality", quality, openMenu, qualityOptions, isVideo ? "清晰度" : "画质", nodeId),
    isVideo ? renderCanvasParameterMenu("durationSec", `${duration}秒`, openMenu, durationOptions, "时长", nodeId) : "",
  ].filter(Boolean).join("");
}

function shouldRenderCanvasParameterControl(key, parameter) {
  if (parameter?.visible === false) {
    return false;
  }
  if (["prompt", "negativePrompt", "referenceImages", "editInstruction"].includes(key)) {
    return false;
  }
  return canvasOptionPairsFromParameter(parameter).length > 0;
}

function canvasOptionPairsFromParameter(parameter) {
  const rawOptions = Array.isArray(parameter?.options)
    ? parameter.options
    : Array.isArray(parameter?.enum)
      ? parameter.enum
      : [];
  return rawOptions
    .map((item) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const value = String(item.value ?? item.providerValue ?? item.label ?? "").trim();
        const label = String(item.label ?? item.name ?? value).trim();
        return value ? [value, label || value] : null;
      }
      const value = String(item ?? "").trim();
      return value ? [value, value] : null;
    })
    .filter(Boolean);
}

function canvasOptionPairsFromValues(values, fallback = [], labeler = (value) => value) {
  const source = Array.isArray(values) && values.length ? values : fallback;
  return source
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .map((value) => [value, String(labeler(value))]);
}

function resolveCanvasParameterValue(key, { parameter, options, selectedModel, parameterValues, mediaKind }) {
  const defaults = selectedModel?.defaultParams && typeof selectedModel.defaultParams === "object" ? selectedModel.defaultParams : {};
  const candidates = [
    parameterValues?.[key],
    key === "aspectRatio" ? parameterValues?.imageAspectRatio : undefined,
    key === "quality" && mediaKind !== "video" ? parameterValues?.imageResolution : undefined,
    key === "resolution" ? (mediaKind === "video" ? parameterValues?.videoResolution : parameterValues?.imageResolution) : undefined,
    key === "durationSec" ? parameterValues?.videoDurationSec : undefined,
    defaults[key],
    options[0]?.[0],
  ];
  const optionValues = new Set(options.map(([value]) => String(value)));
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null && candidate !== "" && optionValues.has(String(candidate))) {
      return String(candidate);
    }
  }
  return String(options[0]?.[0] ?? "");
}

function firstCanvasParameterValue(...candidates) {
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null && candidate !== "") {
      return String(candidate);
    }
  }
  return "";
}

function canvasParameterLabel(value, options) {
  return options.find(([optionValue]) => String(optionValue) === String(value))?.[1] ?? String(value ?? "");
}

function resolveCanvasNodeParameterValues(node = null, ui = {}) {
  const data = node?.data && typeof node.data === "object" ? node.data : {};
  return {
    ...(ui.generationParameterValues ?? {}),
    ...(data.parameterValues && typeof data.parameterValues === "object" ? data.parameterValues : {}),
    ...data,
  };
}

function renderCanvasParameterMenu(field, label, openMenu, options, title = "", nodeId = "") {
  if (!options.length) {
    return "";
  }
  const open = openMenu === `canvas:${field}`;
  return `
    <span class="canvas-parameter-wrap">
      <button type="button" data-action="toggle-generation-select-menu" data-field="${escapeAttr(field)}" data-scope="canvas" data-node-id="${escapeAttr(nodeId)}" title="${escapeAttr(title)}">${escapeHtml(label)}</button>
      ${open ? `<span class="canvas-parameter-menu">${options.map(([value, text]) => `<button type="button" data-action="select-generation-field-option" data-field="${escapeAttr(field)}" data-value="${escapeAttr(value)}" data-scope="canvas" data-node-id="${escapeAttr(nodeId)}">${escapeHtml(text)}</button>`).join("")}</span>` : ""}
    </span>
  `;
}

function renderLiblibGenerationEditor(node, { modelOptionHtml = "", parameterControlHtml = "", canvasDocument = {}, selectedModel = null } = {}) {
  const mediaKind = node?.data?.mediaKind === "video" || node?.type === "video" ? "video" : "image";
  const videoMode = mediaKind === "video" ? resolveCanvasVideoGenerationMode(node) : "";
  const placeholder = mediaKind === "video" ? "请输入您的生视频要求" : "请输入您的生图要求";
  const cost = resolveCanvasModelCredits(selectedModel, mediaKind);
  const connectedTextFragments = resolveConnectedCanvasTextFragments(canvasDocument, node?.id);
  const connectedUploadReferences = mediaKind === "image" || mediaKind === "video"
    ? resolveCanvasUploadReferences(canvasDocument, node?.id)
    : [];
  return `
    <aside class="canvas-node-editor generation-editor ${mediaKind}" data-node-id="${escapeAttr(node?.id ?? "")}" aria-label="${mediaKind === "video" ? "视频生成设置" : "图片生成设置"}" style="${escapeAttr(canvasEditorPositionStyle(node, mediaKind === "video" ? { nodeWidth: 420, nodeHeight: 378, editorWidth: 608 } : { nodeWidth: 420, nodeHeight: 378, editorWidth: 600 }))}">
      ${mediaKind === "video" ? renderCanvasVideoModeTabs(videoMode, node?.id ?? "") : ""}
      <div class="canvas-editor-reference-row">
        <button class="canvas-editor-upload" type="button" aria-label="添加参考素材">+</button>
        ${renderCanvasConnectedTextReference(connectedTextFragments)}
        ${renderCanvasGenerationReferences(connectedUploadReferences)}
      </div>
      <textarea
        aria-label="提示词"
        data-canvas-prompt-input
        data-node-id="${escapeAttr(node?.id ?? "")}"
        placeholder="${escapeAttr(placeholder)}"
      >${escapeHtml(node?.data?.prompt ?? "")}</textarea>
      <footer class="canvas-editor-controls">
        <select aria-label="模型" data-canvas-model-select data-node-id="${escapeAttr(node?.id ?? "")}">
          ${modelOptionHtml}
        </select>
        ${parameterControlHtml}
        <button class="canvas-generate-button" type="button" data-action="run-canvas-node" data-node-id="${escapeAttr(node?.id ?? "")}">✦ ${cost} 生成</button>
      </footer>
    </aside>
  `;
}

function resolveCanvasModelCredits(model, mediaKind = "image") {
  const pricing = model?.pricing && typeof model.pricing === "object" && !Array.isArray(model.pricing)
    ? model.pricing
    : {};
  const pricingJson = model?.pricingJson && typeof model.pricingJson === "object" && !Array.isArray(model.pricingJson)
    ? model.pricingJson
    : {};
  const pricingSnakeJson = model?.pricing_json && typeof model.pricing_json === "object" && !Array.isArray(model.pricing_json)
    ? model.pricing_json
    : {};
  const candidates = [
    pricing.baseCredits,
    pricing.credits,
    pricing.cost,
    pricing.price,
    pricingJson.baseCredits,
    pricingJson.credits,
    pricingJson.cost,
    pricingJson.price,
    pricingSnakeJson.baseCredits,
    pricingSnakeJson.credits,
    pricingSnakeJson.cost,
    pricingSnakeJson.price,
    model?.displayBaseCost,
    model?.baseCredits,
    model?.credits,
    model?.creditCost,
    model?.cost,
    model?.price,
    model?.priceCredits,
  ];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) {
      return String(Math.round(value));
    }
  }
  return mediaKind === "video" ? "4500" : "90";
}

function renderCanvasVideoModeTabs(activeMode, nodeId) {
  return `
    <div class="canvas-editor-tabs video-mode-tabs" role="tablist" aria-label="视频生成模式">
      ${CANVAS_VIDEO_GENERATION_MODES.map((mode) => `
        <button class="${mode.id === activeMode ? "active" : ""}" type="button" role="tab" aria-selected="${mode.id === activeMode ? "true" : "false"}" data-action="set-canvas-video-generation-mode" data-node-id="${escapeAttr(nodeId)}" data-mode="${escapeAttr(mode.id)}">${escapeHtml(mode.label)}</button>
      `).join("")}
    </div>
  `;
}

function resolveCanvasVideoGenerationMode(node) {
  const mode = String(node?.data?.videoGenerationMode ?? node?.data?.videoMode ?? "").trim();
  return CANVAS_VIDEO_GENERATION_MODES.some((item) => item.id === mode) ? mode : "first-frame";
}

function canvasModelMatchesVideoMode(model, mode) {
  const category = String(model?.videoCategory ?? model?.video_category ?? "").trim();
  if (category) {
    return canvasVideoCategoryMatchesMode(category, mode);
  }
  const supportedModes = Array.isArray(model?.supportedModes)
    ? model.supportedModes.map((item) => normalizeCanvasModeToken(item)).filter(Boolean)
    : [];
  if (!supportedModes.length) {
    return true;
  }
  const aliases = canvasVideoModeAliases(mode);
  return supportedModes.some((item) => aliases.has(item));
}

function canvasVideoCategoryMatchesMode(videoCategory, mode) {
  const category = normalizeCanvasModeToken(videoCategory);
  const normalizedMode = normalizeCanvasModeToken(mode);
  if (normalizedMode === "reference_video") return category === "reference";
  if (normalizedMode === "first_frame" || normalizedMode === "image_to_video") return category === "first_frame";
  if (normalizedMode === "first_last_frame") return category === "first_last_frame";
  return false;
}

function canvasVideoModeAliases(mode) {
  const normalized = normalizeCanvasModeToken(mode);
  const aliases = new Set([normalized]);
  if (normalized === "first_frame") {
    aliases.add("image_to_video");
    aliases.add("video_first_frame");
    aliases.add("video_image_to_video");
  } else if (normalized === "first_last_frame") {
    aliases.add("video_first_last_frame");
  } else if (normalized === "reference_video") {
    aliases.add("reference");
    aliases.add("video_reference");
    aliases.add("reference_image_to_video");
    aliases.add("video_reference_image_to_video");
  }
  return aliases;
}

function normalizeCanvasModeToken(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[.\-]/g, "_");
}

function resolveConnectedCanvasTextFragments(document = {}, nodeId = "") {
  const normalizedNodeId = String(nodeId ?? "");
  if (!normalizedNodeId) {
    return [];
  }
  const nodes = Array.isArray(document.nodes) ? document.nodes : [];
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const edges = Array.isArray(document.edges) ? document.edges : [];
  return edges
    .filter((edge) => edge.targetNodeId === normalizedNodeId)
    .map((edge) => nodeMap.get(edge.sourceNodeId))
    .filter((node) => node && (node.type === "script" || node.type === "director" || node.data?.mediaKind === "text"))
    .map((node) => {
      const text = normalizeCanvasFragmentText(node.data?.text || stripCanvasHtml(node.data?.textHtml));
      return {
        id: String(node.id ?? ""),
        title: String(node.data?.title ?? "文本片段"),
        text,
      };
    })
    .filter((item) => item.text);
}

function renderCanvasConnectedTextReference(fragments = []) {
  if (!fragments.length) {
    return "";
  }
  const preview = fragments
    .map((fragment, index) => {
      const title = fragments.length > 1 ? `${index + 1}. ${fragment.title}` : fragment.title;
      return `${title}\n${fragment.text}`;
    })
    .join("\n\n");
  return `
    <span class="canvas-connected-text-reference">
      <button class="canvas-connected-text-trigger" type="button" aria-label="查看连接剧本片段">
        ${renderCanvasIcon("text")}
        <i>${escapeHtml(String(fragments.length))}</i>
      </button>
      <span class="canvas-connected-text-popover" role="tooltip">${escapeHtml(preview)}</span>
    </span>
  `;
}

function normalizeCanvasFragmentText(text) {
  return String(text ?? "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 420);
}

function stripCanvasHtml(html) {
  return String(html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h1|h2|h3|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function renderLiblibTextEditor(node) {
  return `
    <aside class="canvas-node-editor text-editor" data-node-id="${escapeAttr(node?.id ?? "")}" aria-label="文本节点编辑" style="${escapeAttr(canvasEditorPositionStyle(node, { nodeWidth: 310, nodeHeight: 300, editorWidth: 960 }))}">
      <textarea
        aria-label="节点内容"
        data-canvas-text-input
        data-node-id="${escapeAttr(node?.id ?? "")}"
        placeholder="写下你想讲的故事、场景或角色设定。例如：一个来自未来的机器人，在城市屋顶看星星。"
      >${escapeHtml(node?.data?.text ?? "")}</textarea>
      <footer class="canvas-editor-controls">
        <button class="canvas-model-chip" type="button">GVLM 3.1⌄</button>
        <span class="canvas-editor-spacer"></span>
        <button type="button" aria-label="翻译">${renderCanvasIcon("translate")}</button>
        <button type="button" aria-label="积分">✦ 1</button>
        <button class="canvas-send-button" type="button" data-action="run-canvas-node" data-node-id="${escapeAttr(node?.id ?? "")}" aria-label="发送">${renderCanvasIcon("arrow-up")}</button>
      </footer>
    </aside>
  `;
}

function renderCanvasContextMenu(menu = {}, options = {}) {
  const isNodeMenu = menu.mode === "node" && menu.nodeId;
  const menuWidth = 244;
  const menuHeight = isNodeMenu ? 296 : 236;
  const stageWidth = Number(menu.stageWidth ?? 0);
  const stageHeight = Number(menu.stageHeight ?? 0);
  const maxLeft = stageWidth > menuWidth ? stageWidth - menuWidth - 8 : Number.POSITIVE_INFINITY;
  const maxTop = stageHeight > menuHeight ? stageHeight - menuHeight - 8 : Number.POSITIVE_INFINITY;
  const left = Math.max(8, Math.min(maxLeft, Number(menu.x ?? 120)));
  const top = Math.max(8, Math.min(maxTop, Number(menu.y ?? 120)));
  const items = resolveCanvasNodeTemplates(options.episodeGenerationConfig);
  return `
    <aside class="canvas-context-menu${isNodeMenu ? " canvas-node-context-menu" : ""}" data-canvas-context-menu role="menu" aria-label="${isNodeMenu ? "节点操作菜单" : "添加节点菜单"}" style="left:${left}px;top:${top}px">
      ${isNodeMenu ? `
        <button type="button" role="menuitem" class="danger" data-action="delete-canvas-node" data-node-id="${escapeAttr(menu.nodeId)}">
          <span aria-hidden="true">${renderCanvasIcon("trash")}</span>
          删除
        </button>
      ` : ""}
      ${items.map((item) => `
        <button type="button" role="menuitem" data-action="add-canvas-template" data-template-id="${escapeAttr(item.id)}" data-node-kind="${escapeAttr(item.type)}">
          <span aria-hidden="true">${renderCanvasIcon(item.type)}</span>
          ${escapeHtml(item.title)}
        </button>
      `).join("")}
    </aside>
  `;
}

function resolveCanvasScriptPicker(ui = {}, state = {}) {
  const picker = ui.canvasScriptPicker && typeof ui.canvasScriptPicker === "object"
    ? ui.canvasScriptPicker
    : null;
  if (!picker?.nodeId) {
    return null;
  }
  const scripts = resolveCanvasProjectScripts(state, ui);
  const selectedScript =
    scripts.find((script) => script.id === picker.scriptId) ??
    (picker.scriptId ? null : null);
  return {
    nodeId: String(picker.nodeId),
    x: Number(picker.x ?? 140),
    y: Number(picker.y ?? 120),
    scriptId: picker.scriptId ?? "",
    scripts,
    selectedScript,
  };
}

function resolveCanvasProjectScripts(state = {}, ui = {}) {
  const records = [];
  const sectionCache = ui?.canvasScriptSectionsByScriptId && typeof ui.canvasScriptSectionsByScriptId === "object"
    ? ui.canvasScriptSectionsByScriptId
    : {};
  const pushScript = (script = {}, episodes = []) => {
    const id = String(script.id ?? script.scriptId ?? "");
    if (!id || records.some((record) => record.id === id)) {
      return;
    }
    const projectId = String(script.projectId ?? script.project?.id ?? script.project_id ?? state?.projectDetail?.project?.id ?? state?.project?.id ?? "");
    const sections = Array.isArray(sectionCache[id])
      ? resolveCanvasScriptEpisodes(sectionCache[id], script)
      : [];
    records.push({
      id,
      projectId,
      title: String(script.title ?? script.name ?? state?.project?.name ?? state?.projectDetail?.project?.name ?? "项目剧本"),
      type: String(script.typeLabel ?? script.type ?? script.scriptType ?? "原始剧本"),
      updatedAt: String(script.updatedAt ?? script.createdAt ?? ""),
      text: String(script.inputText ?? script.text ?? script.content ?? ""),
      sections,
      episodes: resolveCanvasScriptEpisodes(episodes, script),
    });
  };
  if (state?.projectDetail?.script) {
    pushScript(state.projectDetail.script, state.projectDetail.episodes);
  }
  if (state?.script) {
    pushScript(state.script, state?.projectDetail?.episodes ?? []);
  }
  const scriptRecords = [
    ...(Array.isArray(state?.projectDetail?.scriptRecords) ? state.projectDetail.scriptRecords : []),
    ...(Array.isArray(state?.projectDetail?.scripts) ? state.projectDetail.scripts : []),
    ...(Array.isArray(ui?.projectDetail?.scriptRecords) ? ui.projectDetail.scriptRecords : []),
    ...(Array.isArray(ui?.projectDetail?.scripts) ? ui.projectDetail.scripts : []),
    ...(Array.isArray(ui?.scriptRecords) ? ui.scriptRecords : []),
    ...(Array.isArray(ui?.scriptLibraryRecords) ? ui.scriptLibraryRecords : []),
  ];
  scriptRecords.forEach((record) => {
    const script = record.script ?? record;
    pushScript(script, record.episodes ?? script.episodes ?? []);
  });
  return records;
}

function resolveCanvasScriptEpisodes(episodes = [], script = {}) {
  const normalized = Array.isArray(episodes) ? episodes : [];
  if (normalized.length) {
    return normalized.map((episode, index) => ({
      id: String(episode.id ?? episode.episodeId ?? `episode-${index + 1}`),
      title: String(episode.title ?? episode.name ?? `第${index + 1}集`),
      text: String(
        episode.scriptText ??
        episode.inputText ??
        episode.text ??
        episode.summary ??
        script.inputText ??
        script.text ??
        "",
      ),
      storyboardCount: Number(episode.storyboardCount ?? episode.shots?.length ?? 0),
    }));
  }
  return [{
    id: "episode-primary",
    title: "剧一",
    text: String(script.inputText ?? script.text ?? script.content ?? ""),
    storyboardCount: 0,
  }];
}

function renderCanvasScriptPicker(picker = {}) {
  const scriptSelected = Boolean(picker.selectedScript);
  const title = scriptSelected ? "选择目录" : "选择剧本";
  const selectedItems = picker.selectedScript?.sections?.length
    ? picker.selectedScript.sections
    : picker.selectedScript?.episodes ?? [];
  const items = scriptSelected ? selectedItems : picker.scripts;
  return `
    <aside class="canvas-script-picker" data-canvas-script-picker style="left:${Math.max(8, Math.round(picker.x))}px;top:${Math.max(8, Math.round(picker.y))}px" aria-label="${escapeAttr(title)}">
      <header>
        ${scriptSelected ? `<button type="button" data-action="open-canvas-script-picker" data-node-id="${escapeAttr(picker.nodeId)}" aria-label="返回剧本列表">${renderCanvasIcon("collapse")}</button>` : ""}
        <strong>${escapeHtml(title)}</strong>
      </header>
      <div class="canvas-script-picker-list">
        ${items.length ? items.map((item) => scriptSelected
          ? renderCanvasEpisodePickerItem(item, picker)
          : renderCanvasScriptPickerItem(item, picker)).join("") : `<p>暂无可用${scriptSelected ? "剧集" : "剧本"}</p>`}
      </div>
    </aside>
  `;
}

function renderCanvasScriptPickerItem(script, picker) {
  return `
    <button type="button" data-action="select-canvas-script-source" data-node-id="${escapeAttr(picker.nodeId)}" data-script-id="${escapeAttr(script.id)}">
      ${renderCanvasIcon("book")}
      <span>
        <strong>${escapeHtml(script.title)}</strong>
      </span>
    </button>
  `;
}

function renderCanvasEpisodePickerItem(episode, picker) {
  return `
    <button type="button" data-action="apply-canvas-script-episode" data-node-id="${escapeAttr(picker.nodeId)}" data-script-id="${escapeAttr(picker.scriptId)}" data-episode-id="${escapeAttr(episode.id)}">
      ${renderCanvasIcon("story")}
      <span>
        <strong>${escapeHtml(episode.title)}</strong>
        <small>${episode.storyboardCount ? `${escapeHtml(String(episode.storyboardCount))} 分镜` : "剧集文本"}</small>
      </span>
    </button>
  `;
}

function canvasNodePositionStyle(node, fallbackSize = {}) {
  const x = Number(node?.position?.x ?? 360);
  const y = Number(node?.position?.y ?? 100);
  const width = Number(node?.size?.width ?? fallbackSize.width ?? 360);
  const height = Number(node?.size?.height ?? fallbackSize.height ?? 260);
  return `left:${x}px;top:${y}px;--node-width:${width}px;--node-height:${height}px`;
}

function canvasEditorPositionStyle(node, options = {}) {
  const nodeX = Number(node?.position?.x ?? 360);
  const nodeY = Number(node?.position?.y ?? 100);
  const nodeWidth = Number(options.nodeWidth ?? node?.size?.width ?? 360);
  const nodeHeight = Number(options.nodeHeight ?? node?.size?.height ?? 260);
  const editorWidth = Number(options.editorWidth ?? 600);
  const left = Math.max(8, Math.round(nodeX + (nodeWidth / 2) - (editorWidth / 2)));
  const top = Math.round(nodeY + nodeHeight + 2);
  return `left:${left}px;top:${top}px;--editor-width:${editorWidth}px`;
}

function canvasViewportStyle(viewport = {}) {
  const x = Number(viewport.x ?? 0);
  const y = Number(viewport.y ?? 0);
  const zoom = Number(viewport.zoom ?? 1);
  return `--canvas-pan-x:${x}px;--canvas-pan-y:${y}px;--canvas-zoom:${zoom}`;
}

function canvasGridStyle(viewport = {}) {
  const x = Number(viewport.x ?? 0);
  const y = Number(viewport.y ?? 0);
  const zoom = Number(viewport.zoom ?? 1);
  const gridSize = Math.max(6, Math.round(18 * zoom * 100) / 100);
  return `--canvas-grid-size:${gridSize}px;--canvas-grid-x:${x}px;--canvas-grid-y:${y}px`;
}

function renderCanvasInspectorMetrics({ inputCount = 0, outputCount = 0, selectedNode = null } = {}) {
  if (selectedNode?.type === "script") {
    return `
      <div class="canvas-inspector-metrics">
        <span><b>${outputCount}</b>输出</span>
        <span><b>${escapeHtml(canvasSourceLabel(selectedNode?.data?.source))}</b>来源</span>
        <span><b>${escapeHtml(selectedNode?.data?.status ?? "idle")}</b>状态</span>
      </div>
    `;
  }
  return `
    <div class="canvas-inspector-metrics">
      <span><b>${inputCount}</b>输入</span>
      <span><b>${escapeHtml(selectedNode?.data?.modelCode ?? "未选")}</b>模型</span>
      <span><b>${escapeHtml(selectedNode?.data?.status ?? "idle")}</b>状态</span>
    </div>
  `;
}

function canvasSourceLabel(source) {
  if (source === "project_script") {
    return "项目剧本";
  }
  if (source === "upload") {
    return "上传";
  }
  return source || "手动";
}

function renderCanvasElementItem(node, active = false) {
  const kind = node?.type ?? "output";
  const title = node?.data?.title ?? node?.id ?? "节点";
  const status = node?.data?.status ?? "idle";
  const meta = node?.data?.modelCode
    ? `${node.data.modelCode} · ${node.data.mediaKind ?? kind}`
    : node?.data?.source === "project_script"
      ? "项目剧本片段"
      : status;
  return `
    <button class="canvas-element-item ${kind} ${active ? "active" : ""}" type="button" data-action="select-canvas-node" data-node-id="${escapeAttr(node?.id ?? "")}" data-node-kind="${escapeAttr(kind)}">
      <span class="canvas-element-icon" aria-hidden="true">${renderCanvasIcon(kind)}</span>
      <span class="canvas-element-copy">
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(meta)}</small>
      </span>
      <i>${escapeHtml(status)}</i>
    </button>
  `;
}

function renderCanvasQuickAction(kind, label) {
  return `
    <button class="canvas-quick-action ${kind}" type="button">
      <span aria-hidden="true">${renderCanvasIcon(kind)}</span>
      <strong>${escapeHtml(label)}</strong>
    </button>
  `;
}

function renderCanvasIcon(icon) {
  const icons = {
    audio: '<path d="M9 18V6l10-2v12" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="16" r="2" />',
    book: '<path d="M5 5.5h6.2a2.8 2.8 0 0 1 2.8 2.8v10.2H7.8A2.8 2.8 0 0 1 5 15.7V5.5Z" /><path d="M14 8.3h5v10.2h-5" />',
    clock: '<circle cx="12" cy="12" r="8" /><path d="M12 7.8v4.6l3 1.8" />',
    collapse: '<path d="M14 6 8 12l6 6" /><path d="M20 6 14 12l6 6" />',
    copy: '<rect x="8" y="8" width="10" height="10" rx="1.6" /><path d="M6 15.5H5.8A1.8 1.8 0 0 1 4 13.7V5.8A1.8 1.8 0 0 1 5.8 4h7.9A1.8 1.8 0 0 1 15.5 5.8V6" />',
    cursor: '<path d="M7 4.5 18.5 12 13 13.2l-2.4 5.1L7 4.5Z" />',
    download: '<path d="M12 4.5v10" /><path d="m7.5 10 4.5 4.5 4.5-4.5" /><path d="M5 19.5h14" />',
    fullscreen: '<path d="M8.5 4H4v4.5" /><path d="M4 4l5.2 5.2" /><path d="M15.5 4H20v4.5" /><path d="m20 4-5.2 5.2" /><path d="M8.5 20H4v-4.5" /><path d="m4 20 5.2-5.2" /><path d="M15.5 20H20v-4.5" /><path d="m20 20-5.2-5.2" />',
    grid: '<path d="M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z" />',
    help: '<circle cx="12" cy="12" r="8" /><path d="M9.8 9.4a2.4 2.4 0 1 1 3.8 2c-.9.6-1.5 1.1-1.5 2.1" /><path d="M12 16.7h.01" />',
    image: '<rect x="4.5" y="5" width="15" height="14" rx="2" /><path d="m7.5 16 3.4-4 2.5 2.8 1.7-2 2.9 3.2" /><circle cx="15.5" cy="9" r="1.2" />',
    keyboard: '<rect x="4" y="7" width="16" height="10" rx="1.8" /><path d="M7 10h.01M10 10h.01M13 10h.01M16 10h.01M8 14h8" />',
    link: '<path d="M9.5 14.5 14.5 9.5" /><path d="M10.3 8.2 11.8 6.7a3 3 0 0 1 4.2 4.2l-1.5 1.5" /><path d="M13.7 15.8 12.2 17.3A3 3 0 0 1 8 13.1l1.5-1.5" />',
    minus: '<path d="M5 12h14" />',
    plus: '<path d="M12 5v14M5 12h14" />',
    role: '<rect x="5" y="5" width="14" height="14" rx="2" /><circle cx="12" cy="10" r="2.2" /><path d="M8.4 16a4 4 0 0 1 7.2 0" />',
    search: '<circle cx="10.8" cy="10.8" r="5.8" /><path d="m15.2 15.2 4 4" />',
    share: '<circle cx="6.5" cy="12" r="2" /><circle cx="17.5" cy="7" r="2" /><circle cx="17.5" cy="17" r="2" /><path d="m8.3 11.2 7.4-3.4M8.3 12.8l7.4 3.4" />',
    sort: '<path d="M8 7h9M8 12h6M8 17h3" /><path d="m5 8-2 2 2 2" />',
    send: '<path d="M12 19V5" /><path d="m5 12 7-7 7 7" />',
    story: '<path d="M6 5h12v14H6z" /><path d="M9 8h6M9 11h6M9 14h3" /><path d="M18 8l2-1v10l-2-1" />',
    text: '<rect x="5" y="4.5" width="14" height="15" rx="2" /><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4.5" />',
    trash: '<path d="M5.5 7h13" /><path d="M9 7V5.5h6V7" /><path d="m8 10 .5 8.2h7l.5-8.2" /><path d="M11 11.5v4.8M14 11.5v4.8" />',
    translate: '<path d="M5 5h8" /><path d="M9 5v14" /><path d="M4 19h10" /><path d="M7 9c.7 2.1 2.2 3.9 5 5" /><path d="M12 9c-.7 2.1-2.2 3.9-5 5" /><path d="M17 10l3.5 9" /><path d="M14.5 19l3.5-9" /><path d="M15.5 16h4" />',
    upload: '<path d="M12 16V5" /><path d="m7 10 5-5 5 5" /><path d="M5 19h14" />',
    video: '<rect x="4" y="6" width="13" height="12" rx="2" /><path d="m17 10 4-2v8l-4-2" /><path d="M8 10.5 11.5 12 8 13.5z" />',
    "arrow-up": '<path d="M12 19V5" /><path d="m5 12 7-7 7 7" />',
    user: '<circle cx="12" cy="8.5" r="3" /><path d="M6.5 19a5.5 5.5 0 0 1 11 0" />',
  };

  return `
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      ${icons[icon] ?? icons.plus}
    </svg>
  `;
}

function renderStatusbarActionIcon(icon) {
  const icons = {
    handbook: `
      <path d="M7.5 6.75A2.25 2.25 0 0 1 9.75 4.5H18v12H9.75A2.25 2.25 0 0 0 7.5 18.75M7.5 6.75A2.25 2.25 0 0 0 5.25 4.5H4.5v12h.75A2.25 2.25 0 0 1 7.5 18.75M12 8.25h3.75M12 11.25h3.75" />
    `,
    sparkle: `
      <path d="M9 6.75 9.848 8.902 12 9.75 9.848 10.598 9 12.75 8.152 10.598 6 9.75 8.152 8.902ZM16.5 5.25l.424 1.076L18 6.75l-1.076.424L16.5 8.25l-.424-1.076L15 6.75l1.076-.424ZM15.75 12.75l.636 1.614L18 15l-1.614.636L15.75 17.25l-.636-1.614L13.5 15l1.614-.636Z" />
    `,
    cart: `
      <path d="M2.25 3h1.386a.75.75 0 0 1 .73.582L4.71 5.25H19.5a.75.75 0 0 1 .728.93l-1.5 6A.75.75 0 0 1 18 12.75H6.06a.75.75 0 0 1-.728-.57L3.39 4.5H2.25M7.5 16.5a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm9 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
    `,
    bell: `
      <path d="M14.857 17.082a23.848 23.848 0 0 0 4.182 1.022.75.75 0 0 1 .21 1.415 24.878 24.878 0 0 1-14.498 0 .75.75 0 0 1 .21-1.415 23.848 23.848 0 0 0 4.182-1.022M15 8.25a3 3 0 1 0-6 0c0 1.102-.412 2.105-1.091 2.867-.549.617-.879 1.398-.879 2.258v.375h9.94v-.375c0-.86-.33-1.64-.88-2.258A4.233 4.233 0 0 1 15 8.25Z" />
    `,
    support: `
      <path d="M4.5 12a7.5 7.5 0 1 1 15 0v1.5M6.75 15.75H6A2.25 2.25 0 0 1 3.75 13.5v-.75A2.25 2.25 0 0 1 6 10.5h.75v5.25Zm10.5 0H18a2.25 2.25 0 0 0 2.25-2.25v-.75A2.25 2.25 0 0 0 18 10.5h-.75v5.25ZM9.75 18.75h3.75" />
    `,
    user: `
      <path d="M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM4.5 19.5a7.5 7.5 0 0 1 15 0H4.5Z" />
    `,
  };

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      ${icons[icon] ?? icons.user}
    </svg>
  `;
}

function renderGlobalStatusbar(session, options = {}) {
  const { hideBrand = false, creditBalance = 0 } = options;
  return `
    <header class="global-statusbar ${hideBrand ? "global-statusbar-hide-brand" : ""}" aria-label="全局状态栏">
      <div class="statusbar-brand" aria-label="品牌标识">
        <div class="statusbar-wondershare">
          <span class="statusbar-n-mark" aria-hidden="true">灵</span>
          <div>
            <strong>灵曦剧场</strong>
          </div>
        </div>
      </div>
      <div class="statusbar-actions">
        <button class="statusbar-quick-action text-action" type="button" aria-label="创作手册">
          <span class="statusbar-action-icon">${renderStatusbarActionIcon("handbook")}</span>
          <span>创作手册</span>
        </button>
        <button class="statusbar-quick-action text-action" type="button" aria-label="商务合作">
          <span>商务合作</span>
        </button>
        <button class="statusbar-quick-action credit-action" type="button" aria-label="积分余额" data-action="open-credit-ledger">
          <span class="statusbar-action-icon">${renderStatusbarActionIcon("sparkle")}</span>
          <b>${escapeHtml(String(creditBalance))}</b>
          <span class="statusbar-action-icon trailing">${renderStatusbarActionIcon("cart")}</span>
        </button>
        <button class="statusbar-quick-action icon-action" type="button" aria-label="消息通知">
          <span class="statusbar-action-icon">${renderStatusbarActionIcon("bell")}</span>
        </button>
        <div class="statusbar-popover-wrap">
          <button class="statusbar-quick-action icon-action" type="button" aria-haspopup="menu" aria-label="客服支持">
            <span class="statusbar-action-icon">${renderStatusbarActionIcon("support")}</span>
          </button>
          <div class="statusbar-popover support-popover" role="menu">
            <button class="popover-menu-item featured" type="button" role="menuitem">
              <strong>客服热线：4000-300624</strong>
            </button>
            <button class="popover-menu-item" type="button" role="menuitem">在线客服</button>
            <button class="popover-menu-item" type="button" role="menuitem">专属服务支持</button>
          </div>
        </div>
        <div class="statusbar-popover-wrap">
          <button class="statusbar-avatar hero-avatar" type="button" aria-haspopup="menu" aria-label="账号">
            <span class="statusbar-action-icon user-avatar-icon">${renderStatusbarActionIcon("user")}</span>
          </button>
          <div class="statusbar-popover account-popover" role="menu">
            <div class="account-popover-card">
              <strong>创作者 ${escapeHtml(session.user.phone.slice(-8) || "442027442")}</strong>
              <span>升级专业版，创建协作团队</span>
            </div>
            <button class="popover-menu-item" type="button" role="menuitem">我的订阅</button>
            <button class="popover-menu-item" type="button" role="menuitem">订单开票</button>
            <button class="popover-menu-item" type="button" role="menuitem">合伙人中心</button>
            <button class="popover-menu-item" type="button" role="menuitem" data-action="open-account-settings">账号设置</button>
            <button class="popover-menu-item" type="button" role="menuitem">水印设置</button>
            <button class="popover-menu-item" type="button" role="menuitem">更新日志</button>
            <button class="popover-menu-item" type="button" role="menuitem">问题反馈</button>
            <button class="popover-menu-item" type="button" role="menuitem">政策广场</button>
            <button class="popover-menu-item" type="button" role="menuitem">专属服务支持</button>
            <button class="popover-menu-item danger" type="button" role="menuitem" data-action="logout">退出登录</button>
          </div>
        </div>
      </div>
    </header>
  `;
}

function renderHomeHero({ detailState }) {
  return `
    <section class="home-hero" aria-label="首页">
      <div class="home-liquid-ether" data-liquid-ether-root aria-hidden="true"></div>
      <div class="hero-overlay"></div>
      <div class="hero-content">
        <div class="hero-brand-lockup">
          <div class="hero-brand-mark" aria-hidden="true">灵</div>
          <div class="hero-brand-text">灵曦剧场</div>
        </div>
        <h1 class="hero-title">您的专属 AI 电影工作室</h1>
        <div class="hero-value-row" aria-label="核心卖点">
          <span>影视级规模化生产</span>
          <span>小成本成就大爆款</span>
        </div>
        <div class="hero-actions">
          <button class="hero-cta" type="button" data-action="open-create-modal">创建项目</button>
        </div>
        <div class="hero-status-strip">
          <span>${escapeHtml(detailState.project.statusLabel)}</span>
          <span>${escapeHtml(detailState.project.type)}</span>
          <span>${escapeHtml(detailState.project.aspectRatio)}</span>
        </div>
      </div>
    </section>
  `;
}

function renderScrollableWorkbenchSurface(surface, content) {
  const legacyClass = surface === "library" ? " library-workspace-scroll" : "";
  return `
    <div class="workbench-scroll-surface${legacyClass}" data-scroll-surface="${escapeAttr(surface)}">
      ${content}
    </div>
  `;
}

function renderProjectGallery({ ui }) {
  const snapshot = getProjectGallerySnapshot(ui);
  const selectedIds = normalizeSelectedProjectIds(ui.selectedProjectIds);
  const selectedCount = snapshot.pageProjects.filter((project) => selectedIds.has(String(project.id ?? ""))).length;
  const searchQuery = snapshot.searchQuery;
  const searchDraft = String(ui.projectSearchDraft ?? searchQuery);

  return `
    <section class="project-gallery-shell">
      <header class="project-gallery-header">
        <div>
          <h1>全部项目(${snapshot.totalProjects})</h1>
        </div>
        <div class="project-gallery-filters">
          <label class="gallery-search">
            <input
              type="search"
                placeholder="请输入项目名称"
              value="${escapeHtml(searchDraft)}"
              data-action="search-projects"
            />
          </label>
        </div>
      </header>
      <div class="project-gallery-toolbar">
        <div class="project-gallery-toolbar-summary">
          <strong>本页已选 ${selectedCount}</strong>
          <span>仅作用于当前页</span>
        </div>
        <div class="project-gallery-toolbar-actions">
          <button class="gallery-toolbar-button" type="button" data-action="select-current-page-projects">全选本页</button>
          <button class="gallery-toolbar-button" type="button" data-action="clear-selected-projects" ${selectedCount ? "" : "disabled"}>取消选择</button>
          <button class="gallery-toolbar-button danger" type="button" data-action="delete-selected-projects" ${selectedCount ? "" : "disabled"}>删除所选</button>
        </div>
      </div>
      <section class="project-gallery-grid" aria-label="项目列表">
        ${
          snapshot.totalProjects
            ? snapshot.pageProjects.map((project) => renderProjectCard(
                project,
                ui.projectCardMenuId === project.id,
                selectedIds.has(String(project.id ?? "")),
              )).join("")
            : renderEmptyProjectState(searchQuery, [])
        }
      </section>
      ${renderWorkspaceStatusToast(ui.toast)}
      ${snapshot.totalProjects ? renderProjectGalleryPagination(snapshot.totalProjects, snapshot.currentPage, snapshot.totalPages, snapshot.pageProjects.length) : ""}
      <div class="project-gallery-footer">
        <button class="hero-cta gallery-create-button" type="button" data-action="open-create-modal">创建项目</button>
      </div>
    </section>
  `;
}

export function getProjectGallerySnapshot(ui = {}) {
  const projects = Array.isArray(ui.projectLibrary) ? ui.projectLibrary : [];
  const searchQuery = String(ui.projectSearchQuery ?? "").trim();
  const filteredProjects = filterProjects(sortProjectsByCreatedAt(projects), searchQuery, ui);
  const projectsPerPage = resolveProjectGalleryPageSize(ui);
  const totalProjects = filteredProjects.length;
  const totalPages = Math.max(1, Math.ceil(totalProjects / projectsPerPage));
  const currentPage = Math.min(Math.max(1, Number(ui.projectLibraryPage ?? 1)), totalPages);
  const pageStart = (currentPage - 1) * projectsPerPage;
  const pageProjects = filteredProjects.slice(pageStart, pageStart + projectsPerPage);
  return {
    searchQuery,
    filteredProjects,
    projectsPerPage,
    totalProjects,
    totalPages,
    currentPage,
    pageProjects,
  };
}

export function resolveProjectGalleryPageSize(ui = {}) {
  const columns = Math.min(
    PROJECT_GALLERY_MAX_COLUMNS,
    Math.max(1, Math.floor(Number(ui.projectLibraryColumns ?? PROJECT_GALLERY_DEFAULT_COLUMNS))),
  );
  return columns * PROJECT_GALLERY_ROWS_PER_PAGE;
}

function normalizeSelectedProjectIds(value) {
  return new Set(
    (Array.isArray(value) ? value : [])
      .map((id) => String(id ?? "").trim())
      .filter(Boolean),
  );
}

function renderProjectGalleryPagination(totalProjects, currentPage, totalPages, pageSize) {
  const pages = buildProjectPageItems(currentPage, totalPages);
  return `
    <footer class="project-gallery-pagination" aria-label="项目分页">
      <div class="project-gallery-pagination-summary">
        <span>共 ${totalProjects} 条</span>
        <span>${pageSize} 条/页</span>
      </div>
      <div class="project-gallery-pagination-controls">
        <button
          class="project-gallery-page-button"
          type="button"
          data-action="change-project-page"
          data-page="${currentPage - 1}"
          ${currentPage <= 1 ? "disabled" : ""}
          aria-label="上一页"
        >
          ‹
        </button>
        ${pages
          .map((page) =>
            page === "ellipsis"
              ? '<span class="project-gallery-page-ellipsis" aria-hidden="true">…</span>'
              : `
                <button
                  class="project-gallery-page-button ${page === currentPage ? "active" : ""}"
                  type="button"
                  data-action="change-project-page"
                  data-page="${page}"
                  aria-current="${page === currentPage ? "page" : "false"}"
                >
                  ${page}
                </button>
              `,
          )
          .join("")}
        <button
          class="project-gallery-page-button"
          type="button"
          data-action="change-project-page"
          data-page="${currentPage + 1}"
          ${currentPage >= totalPages ? "disabled" : ""}
          aria-label="下一页"
        >
          ›
        </button>
      </div>
    </footer>
  `;
}

function buildProjectPageItems(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, "ellipsis", totalPages];
  }

  if (currentPage >= totalPages - 3) {
    return [1, "ellipsis", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, "ellipsis", currentPage - 1, currentPage, currentPage + 1, "ellipsis", totalPages];
}

function renderProjectCard(project, isMenuOpen, isSelected = false) {
  const hasCover = Boolean(project.coverImageUrl);
  const coverInputId = `project-cover-input-${escapeHtml(project.id)}`;
  return `
    <article class="project-gallery-card ${isSelected ? "is-selected" : ""}" data-action="open-project-workspace" data-project-id="${escapeHtml(project.id)}">
      <button
        class="project-gallery-select-toggle"
        type="button"
        data-action="toggle-project-selection"
        data-project-id="${escapeHtml(project.id)}"
        aria-pressed="${isSelected ? "true" : "false"}"
        aria-label="${isSelected ? "取消选择项目" : "选择项目"}"
        title="${isSelected ? "取消选择" : "选择当前项目"}"
      >
        <span aria-hidden="true"></span>
      </button>
      <div class="project-gallery-poster ${hasCover ? "has-cover" : "needs-cover"}">
        <label class="project-cover-placeholder" for="${coverInputId}" data-action="pick-project-cover" data-project-id="${escapeHtml(project.id)}">
          <span class="project-cover-placeholder-icon" aria-hidden="true">+</span>
          <strong>上传封面</strong>
        </label>
        <img class="project-gallery-cover" src="${escapeHtml(getProjectCoverSrc(project))}" alt="${escapeHtml(project.name)} 封面" />
      </div>
      <input id="${coverInputId}" class="project-cover-input" type="file" accept="image/*" data-action="upload-project-cover" data-project-id="${escapeHtml(project.id)}" />
      <div class="project-gallery-meta">
        <div class="project-gallery-copy">
          <h2>${escapeHtml(project.name)}</h2>
          <p>创建于：${escapeHtml(project.createdAt ?? "2026/05/21")}</p>
        </div>
        <div class="project-card-actions">
          <button
            class="project-card-menu-button"
            type="button"
            data-action="toggle-project-card-menu"
            data-project-id="${escapeHtml(project.id)}"
            aria-label="打开项目操作"
            aria-expanded="${isMenuOpen ? "true" : "false"}"
          >
            <span aria-hidden="true">编辑</span>
          </button>
          ${isMenuOpen ? renderProjectCardMenu(project) : ""}
        </div>
      </div>
    </article>
  `;
}

function getProjectCoverSrc(project) {
  if (project.coverImageUrl) {
    return resolveApiUrl(project.coverImageUrl);
  }

  const name = String(project.name ?? "新项目");
  const seed = String(project.id ?? name);
  const hue = computeHue(seed);
  const accent = (hue + 28) % 360;
  const monogram = [...name].slice(0, 2).join("") || "项目";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 720">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="hsl(${hue} 28% 16%)"/>
          <stop offset="100%" stop-color="hsl(${accent} 36% 24%)"/>
        </linearGradient>
        <radialGradient id="glow" cx="28%" cy="22%" r="46%">
          <stop offset="0%" stop-color="hsla(${accent} 90% 72% / 0.24)"/>
          <stop offset="100%" stop-color="transparent"/>
        </radialGradient>
      </defs>
      <rect width="1200" height="720" rx="48" fill="url(#bg)"/>
      <rect width="1200" height="720" rx="48" fill="url(#glow)"/>
      <text x="96" y="590" fill="rgba(255,255,255,0.9)" font-family="Segoe UI, Microsoft YaHei, sans-serif" font-size="118" font-weight="700">${escapeSvg(monogram)}</text>
      <text x="102" y="650" fill="rgba(255,255,255,0.44)" font-family="Segoe UI, Microsoft YaHei, sans-serif" font-size="36">${escapeSvg(name)}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function computeHue(seed) {
  let total = 0;
  for (const char of seed) {
    total = (total * 31 + char.charCodeAt(0)) % 360;
  }
  return total;
}

function escapeSvg(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function renderProjectCardMenu(project) {
  const menuCoverInputId = `project-cover-menu-input-${escapeHtml(project.id)}`;
  return `
    <div class="project-card-menu" role="menu" aria-label="项目操作">
      <input id="${menuCoverInputId}" class="project-cover-input" type="file" accept="image/*" data-action="upload-project-cover" data-project-id="${escapeHtml(project.id)}" />
      <label class="project-card-menu-item" for="${menuCoverInputId}" data-action="pick-project-cover" data-project-id="${escapeHtml(project.id)}">上传封面</label>
      <button class="project-card-menu-item" type="button" data-action="rename-project-card" data-project-id="${escapeHtml(project.id)}">重命名</button>
      <button class="project-card-menu-item danger" type="button" data-action="delete-project-card" data-project-id="${escapeHtml(project.id)}">删除</button>
    </div>
  `;
}

function renderProjectRenameModal({ show, value, notice }) {
  if (!show) {
    return "";
  }

  return `
    <section class="modal-backdrop rename-project-backdrop" role="dialog" aria-modal="true" aria-label="重命名">
      <div class="rename-project-modal">
        <div class="rename-project-head">
          <h2>重命名</h2>
          <button class="modal-close" type="button" data-action="close-rename-project-modal" aria-label="关闭">×</button>
        </div>
        <label class="rename-project-field">
          <input
            id="project-rename-name-input"
            type="text"
            maxlength="50"
            value="${escapeHtml(value)}"
            placeholder="请输入项目名称"
          />
          <span class="rename-project-count">${[...value].length}/50</span>
        </label>
        <div class="rename-project-actions">
          <p class="modal-inline-status">${escapeHtml(notice)}</p>
          <div class="rename-project-button-row">
            <button class="secondary-action rename-cancel-button" type="button" data-action="close-rename-project-modal">取消</button>
            <button class="primary-action rename-save-button" type="button" data-action="confirm-rename-project-card">保存</button>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderProjectDeleteModal({ show, projectName, mode = "single", count = 0 }) {
  if (!show) {
    return "";
  }
  const normalizedCount = Math.max(0, Number(count) || 0);
  const message = mode === "bulk"
    ? `所选内容将被删除，确定删除本页选中的 ${normalizedCount} 个项目吗？`
    : `所选内容将被删除，确定删除${projectName ? `“${escapeHtml(projectName)}”` : ""}吗？`;

  return `
    <section class="modal-backdrop delete-project-backdrop" role="dialog" aria-modal="true" aria-label="确认删除">
      <div class="delete-project-modal">
        <div class="delete-project-head">
          <div class="delete-project-icon">×</div>
          <div>
            <h2>确认删除</h2>
            <p>${message}</p>
          </div>
          <button class="modal-close" type="button" data-action="close-delete-project-modal" aria-label="关闭">×</button>
        </div>
        <div class="delete-project-actions">
          <button class="secondary-action delete-cancel-button" type="button" data-action="close-delete-project-modal">取消</button>
          <button class="delete-confirm-button" type="button" data-action="confirm-delete-project-card">确定</button>
        </div>
      </div>
    </section>
  `;
}

function renderCanvasProjectRenameModal({ show, value, notice }) {
  if (!show) {
    return "";
  }

  return `
    <section class="modal-backdrop rename-project-backdrop" role="dialog" aria-modal="true" aria-label="重命名画布">
      <div class="rename-project-modal canvas-project-rename-modal">
        <div class="rename-project-head">
          <h2>重命名</h2>
          <button class="modal-close" type="button" data-action="close-rename-canvas-project-modal" aria-label="关闭">×</button>
        </div>
        <label class="rename-project-field">
          <input
            id="canvas-project-rename-name-input"
            type="text"
            maxlength="50"
            value="${escapeHtml(value)}"
            placeholder="请输入画布名称"
          />
          <span class="rename-project-count canvas-project-rename-count">${[...value].length}/50</span>
        </label>
        <div class="rename-project-actions">
          <p class="modal-inline-status">${escapeHtml(notice)}</p>
          <div class="rename-project-button-row">
            <button class="secondary-action rename-cancel-button" type="button" data-action="close-rename-canvas-project-modal">取消</button>
            <button class="primary-action rename-save-button" type="button" data-action="confirm-rename-canvas-project">保存</button>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderCanvasProjectDeleteModal({ show, projectName }) {
  if (!show) {
    return "";
  }

  return `
    <section class="modal-backdrop delete-project-backdrop" role="dialog" aria-modal="true" aria-label="确认删除画布">
      <div class="delete-project-modal canvas-project-delete-modal">
        <div class="delete-project-head">
          <div class="delete-project-icon">×</div>
          <div>
            <h2>确认删除</h2>
            <p>所选内容将被删除，确定删除${projectName ? `“${escapeHtml(projectName)}”` : ""}吗？</p>
          </div>
          <button class="modal-close" type="button" data-action="close-delete-canvas-project-modal" aria-label="关闭">×</button>
        </div>
        <div class="delete-project-actions">
          <button class="secondary-action delete-cancel-button" type="button" data-action="close-delete-canvas-project-modal">取消</button>
          <button class="delete-confirm-button" type="button" data-action="confirm-delete-canvas-project">确定</button>
        </div>
      </div>
    </section>
  `;
}

function renderGenerationQueueJobConfirmModal(ui) {
  const operation = ui.generationQueueJobOperationConfirm ?? null;
  if (!operation) {
    return "";
  }
  const queueName = String(operation.queueName ?? "");
  const jobId = String(operation.jobId ?? "");
  const jobAction = String(operation.jobAction ?? "");
  const isRemove = jobAction === "remove";

  return `
    <section class="modal-backdrop delete-project-backdrop" role="dialog" aria-modal="true" aria-label="确认队列任务操作">
      <div class="delete-project-modal asset-delete-modal">
        <div class="delete-project-head">
          <div class="delete-project-icon">×</div>
          <div>
            <h2>${isRemove ? "确认移除队列任务" : "确认队列任务操作"}</h2>
            <p>${escapeHtml(queueName)} · ${escapeHtml(jobId)}</p>
          </div>
          <button class="modal-close" type="button" data-action="close-generation-queue-job-confirm" aria-label="关闭">×</button>
        </div>
        <div class="delete-project-actions">
          <button class="secondary-action delete-cancel-button" type="button" data-action="close-generation-queue-job-confirm">取消</button>
          <button class="delete-confirm-button" type="button" data-action="confirm-generation-queue-job-operation">${isRemove ? "确认移除" : "确认执行"}</button>
        </div>
      </div>
    </section>
  `;
}

function renderEmptyProjectState(searchQuery, statusFilters) {
  if (searchQuery || statusFilters.length > 0) {
    return '<article class="project-empty-card"><strong>未找到匹配项目</strong><span>试试别的关键词，或者清空筛选查看全部项目。</span></article>';
  }

  return '<article class="project-empty-card"><strong>还没有项目</strong><span>从下方创建项目开始，创建后会在这里出现。</span></article>';
}

function filterProjects(projects, searchQuery, ui = {}) {
  if (!searchQuery) {
    return projects;
  }

  const normalizedQuery = normalizeProjectSearchText(searchQuery);
  const compactQuery = normalizedQuery.replace(/\s+/g, "");
  return projects.filter((project) => {
    const searchableText = buildProjectSearchText(project, ui);
    return searchableText.includes(normalizedQuery) || (compactQuery && searchableText.replace(/\s+/g, "").includes(compactQuery));
  });
}

function buildProjectSearchText(project, ui = {}) {
  return [
    project?.name,
    project?.title,
    project?.scriptTitle,
    project?.scriptName,
    project?.scriptFileName,
    project?.originalScriptTitle,
    project?.currentScriptTitle,
    project?.script?.title,
    project?.script?.name,
    ...(Array.isArray(project?.scripts)
      ? project.scripts.flatMap((script) => [script?.title, script?.name])
      : []),
    ...findProjectScriptTitles(project, ui),
  ]
    .map(normalizeProjectSearchText)
    .filter(Boolean)
    .join(" ");
}

function findProjectScriptTitles(project, ui = {}) {
  const projectId = String(project?.id ?? "").trim();
  if (!projectId || !Array.isArray(ui.scriptLibraryRecords)) {
    return [];
  }
  return ui.scriptLibraryRecords
    .filter((script) => {
      const scriptProjectId = String(script?.projectId ?? script?.project?.id ?? script?.project_id ?? "").trim();
      return scriptProjectId === projectId;
    })
    .flatMap((script) => [script?.title, script?.name]);
}

function normalizeProjectSearchText(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase();
}

function filterProjectsByStatus(projects, statusFilters) {
  if (!statusFilters.length) {
    return projects;
  }

  const activeSet = new Set(statusFilters);
  return projects.filter((project) => activeSet.has(project.status ?? "未开始"));
}

function sortProjectsByCreatedAt(projects) {
  return [...projects]
    .map((project, index) => ({
      project,
      index,
      createdAt: getProjectCreatedAtValue(project),
    }))
    .sort((left, right) => right.createdAt - left.createdAt || right.index - left.index)
    .map(({ project }) => project);
}

function getProjectCreatedAtValue(project) {
  const candidates = [
    project.createdAtTimestamp,
    project.createdAtMs,
    project.createdAtIso,
    project.createdAt,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
    if (typeof candidate === "string") {
      const parsed = Date.parse(candidate.replace(/\./g, "/"));
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return 0;
}

function renderRailTab(tab, activeNavTab) {
  return `
    <button
      class="rail-item ${tab.id === activeNavTab ? "active" : ""}"
      type="button"
      role="tab"
      aria-selected="${tab.id === activeNavTab}"
      data-action="set-nav-tab"
      data-tab="${tab.id}"
    >
      <span class="rail-glyph" aria-hidden="true">${renderRailIcon(tab.icon)}</span>
      <span class="rail-label">${tab.label}</span>
    </button>
  `;
}

function renderRailIcon(icon) {
  const icons = {
    home: `
      <path d="M3.5 10.9 12 3.8l8.5 7.1" />
      <path d="M5.5 9.6v9.1a1.7 1.7 0 0 0 1.7 1.7h9.6a1.7 1.7 0 0 0 1.7-1.7V9.6" />
      <path d="M9.2 20.4v-5.5a1.2 1.2 0 0 1 1.2-1.2h3.2a1.2 1.2 0 0 1 1.2 1.2v5.5" />
      <path d="M17.2 5.2v3.2" />
      <path d="M19.3 15.8h2.5" />
      <path d="M20.6 14.6v2.5" />
    `,
    book: `
      <path d="M5 4.4h7.1a3.1 3.1 0 0 1 3.1 3.1v12.1H8.1A3.1 3.1 0 0 1 5 16.5V4.4Z" />
      <path d="M15.2 7.5h3.1a1.7 1.7 0 0 1 1.7 1.7v10.4h-4.8" />
      <path d="M8.2 8h3.8" />
      <path d="M18.6 3.7v2.6" />
      <path d="M17.3 5h2.6" />
    `,
    clapperboard: `
      <path d="M4.6 8.7h14.8a1.5 1.5 0 0 1 1.5 1.5v8.7a1.5 1.5 0 0 1-1.5 1.5H4.6a1.5 1.5 0 0 1-1.5-1.5v-8.7a1.5 1.5 0 0 1 1.5-1.5Z" />
      <path d="m5.2 8.7 1.2-4.9 14 3.4-.4 1.5" />
      <path d="m8.2 4.2 2.3 5" />
      <path d="m13.1 5.4 2.3 5" />
      <path d="M7.1 13.1h9.8" />
      <path d="M18.4 3.7v2.4" />
      <path d="M17.2 4.9h2.4" />
    `,
    archive: `
      <path d="M5.3 5h13.4a1.4 1.4 0 0 1 1.4 1.4v2.4H3.9V6.4A1.4 1.4 0 0 1 5.3 5Z" />
      <path d="M5.1 8.8v9.8A1.4 1.4 0 0 0 6.5 20h11a1.4 1.4 0 0 0 1.4-1.4V8.8" />
      <path d="M9.1 12.2h5.8" />
      <path d="M17.9 14.9h2.7" />
      <path d="M19.25 13.55v2.7" />
    `,
    wand: `
      <path fill="currentColor" stroke="none" d="M3.7 15.9 5.3 7.4h14.9l-1.6 8.5H3.7Zm4.4-2.9h7.9l0.5-2.7H8.6L8.1 13Z" />
    `,
    users: `
      <path d="M8.8 11.3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M3.8 20.1a5 5 0 0 1 10 0" />
      <path d="M16 11.1a2.4 2.4 0 1 0 0-4.8" />
      <path d="M15.4 15.2a4.1 4.1 0 0 1 4.8 4.9" />
    `,
  };

  return `
    <svg viewBox="0 0 24 24" focusable="false">
      ${icons[icon] ?? icons.home}
    </svg>
  `;
}

function renderMetric(label, value) {
  return `
    <article class="metric-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `;
}

function renderAssetCard(group, state, detailState, busy) {
  const candidates = group.key === "others" ? [] : state.assetCandidates?.[group.key] ?? [];
  const total = group.key === "others" ? detailState.assets.others : detailState.assets[group.key];
  const confirmed = group.key === "others" ? 0 : candidates.filter((candidate) => candidate.confirmed).length;

  return `
    <article class="asset-card ${group.accent}">
      <div class="asset-art" aria-hidden="true"></div>
      <div class="asset-card-head">
        <h3>${escapeHtml(group.label)} 路</h3>
        <span>${confirmed}/${total || 0}</span>
      </div>
      <div class="asset-candidates">
        ${
          candidates.length
            ? candidates.map((candidate) => renderCandidate(group.group, candidate, busy)).join("")
            : '<p class="empty-copy">解析剧本后会显示候选资产。</p>'
        }
      </div>
    </article>
  `;
}

function renderCandidate(group, candidate, busy) {
  return `
    <div class="asset-token ${candidate.confirmed ? "confirmed" : ""}">
      <button type="button" data-action="edit-asset" data-group="${group}" data-asset-key="${candidate.assetKey}" data-label="${candidate.label}">
        ${escapeHtml(candidate.label)}
      </button>
      <button type="button" data-action="confirm-asset" data-group="${group}" data-asset-key="${candidate.assetKey}" ${disabled(candidate.confirmed || busy)}>
        ${candidate.confirmed ? "已确认" : candidate.required ? "确认" : "可选"}
      </button>
    </div>
  `;
}

function getProgress(state) {
  const steps = [
    Boolean(state.project),
    Boolean(state.shots?.length),
    Boolean(state.assetReview?.readyForGeneration),
    Boolean(state.calibration),
    Boolean(state.shots?.length && state.shots.every((shot) => shot.currentImageAssetVersionId)),
    Boolean(state.shots?.length && state.shots.every((shot) => shot.currentVideoAssetVersionId)),
    Boolean(state.exportPreview),
  ];

  return {
    readySteps: steps.filter(Boolean).length,
    totalSteps: steps.length,
  };
}
