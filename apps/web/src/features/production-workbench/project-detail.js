import { renderAssetExtractModal } from "./asset-extract-modal.js";
import { renderEpisodeWorkbench } from "./episode-workbench-rebuilt.js?video-category=1&storyboard-style-picker=1";
import { renderCanvasTextSkillModal } from "./canvas-text-skill-modal.js";
import { renderExportPanel } from "./export-panel.js";
import { buildConfiguredGenerationSettingsSections, renderGenerationControlMenu, renderGenerationSettingsControl, renderGenerationSubmitButton, resolveGenerationCreditCost } from "./generation-control-menu.js";
import { resolveEpisodeWorkbenchPrompt } from "./episode-workbench-prompt.js";
import { renderProjectCreateModal } from "./project-create-modal.js";
import { renderSelectionPickerModal } from "./selection-picker-modal.js";
import {
  EPISODE_PROMPT_SKILL_CATEGORIES,
  normalizeEpisodePromptSkills,
  renderEpisodePromptSkillControl,
  renderEpisodePromptSkillModal,
  sumEpisodePromptSkillCredits,
} from "./episode-prompt-skill-modal.js";
import {
  renderOriginalScriptModal,
  renderScriptManagementPage,
} from "./script-page.js";
import { getProjectDetailState } from "./storyboard-state.js";
import { normalizeNovelStyleScriptText, truncateScriptTextByCharacters } from "./script-text-normalizer.js?single-episode-limit=2";
import { disabled, escapeAttr, escapeHtml } from "./markup.js";
import { renderLibraryTeam, renderPricingModal } from "../library-team/index.js";
import { resolveApiUrl } from "../../shared/creator-api.js";
import {
  renderCanvasPanoramaNodeBody,
  renderCanvasStoryboardNodeBody,
} from "../new-canvas/special-media-nodes.js";
import {
  renderCanvasAnimationControls,
  renderCanvasAnimationNodeBody,
} from "./canvas/canvas-animation-node.js";
import { renderCanvasDirectorNodeBody } from "./canvas/canvas-director-node.js";
import { renderCanvasGroupNodeBody } from "./canvas/canvas-group-node.js";
import {
  renderCanvasMediaNodeBody,
  renderCanvasVideoFullscreen,
  resolveCanvasMediaNodeSource,
} from "./canvas/canvas-media-node.js";
import {
  renderCanvasMarkdownFullscreen,
  renderCanvasMarkdownNodeTools,
} from "./canvas/canvas-markdown-node.js";
import { resolveCanvasNodeToolbarTools } from "./canvas/canvas-node-toolbar.js";
import { createDefaultCanvasDocument, isLegacyStarterCanvasDocument } from "./canvas/canvas-default-document.js";
import { parseCanvasPromptReferences } from "./canvas/canvas-prompt-reference.js";
import {
  buildCanvasSidebarItems,
  resolveCanvasModelOptions,
  resolveCanvasNodeTemplates,
} from "./canvas/canvas-state.js";

const ACCOUNT_DISPLAY_NAME_MAX_LENGTH = 8;
const PROJECT_GALLERY_DEFAULT_PAGE_SIZE = 18;
const CANVAS_PROJECT_GALLERY_PAGE_SIZE = 18;
const CREATOR_GUIDE_URL = "https://hcn2azjrtd3x.feishu.cn/wiki/K20Awy1POixjIUk2RMEc5T1dnDp?from=from_copylink";
const CANVAS_VIDEO_GENERATION_MODES = [
  { id: "first-frame", label: "首帧生视频" },
  { id: "first-last-frame", label: "首尾帧生视频" },
  { id: "reference-video", label: "全能参考" },
];
const CANVAS_AUDIO_GENERATION_MODES = [
  { id: "text-to-speech", label: "语音合成" },
  { id: "music", label: "音乐生成" },
  { id: "transcription", label: "音频转录" },
];
const CANVAS_HISTORY_FILTER_OPTIONS = [
  { id: "all", label: "全部" },
  { id: "text", label: "文本" },
  { id: "image", label: "图像" },
  { id: "video", label: "视频" },
  { id: "audio", label: "音频" },
];
const CANVAS_ASSET_SOURCE_OPTIONS = [
  { id: "outputs", label: "画布产物" },
  { id: "project", label: "项目文件" },
  { id: "global", label: "全局资产" },
  { id: "drama", label: "短剧资产" },
];
const CANVAS_ASSET_RENDER_PAGE_SIZE = 48;

export function resolveEpisodeProjectStyleCode(state = {}, ui = {}) {
  const projects = [
    ui.episodeWorkbenchContext?.data?.project,
    ui.episodeWorkbenchContext?.project,
    ui.projectDetail?.project,
    state.projectDetail?.project,
    state.project,
  ].filter((project) => project && typeof project === "object");
  for (const project of projects) {
    const code = String(
      project.projectType ??
      project.project_type ??
      project.projectStyleCode ??
      project.project_style_code ??
      project.styleCode ??
      project.style_code ??
      project.metadata?.projectType ??
      "",
    ).trim();
    if (code) {
      return code;
    }
  }
  return String(ui.createProjectType ?? "").trim();
}

function resolveSelectedEpisodeProjectStyleCode(state = {}, ui = {}) {
  const selectedCode = String(ui.episodeGenerationStyleCode ?? "").trim();
  const selectedProjectId = String(ui.episodeGenerationStyleProjectId ?? "").trim();
  const activeProjectId = String(
    state.project?.id ??
    state.projectDetail?.project?.id ??
    ui.projectDetail?.project?.id ??
    ui.selectedProjectCardId ??
    "",
  ).trim();
  return selectedProjectId && activeProjectId && selectedProjectId !== activeProjectId ? "" : selectedCode;
}

function resolveSelectedAssetImageStyleSkillId(state = {}, ui = {}) {
  const activeProjectId = String(
    state.project?.id ??
    state.projectDetail?.project?.id ??
    ui.projectDetail?.project?.id ??
    ui.selectedProjectCardId ??
    "",
  ).trim();
  const selectedProjectId = String(ui.assetImageStyleSkillProjectId ?? "").trim();
  return selectedProjectId && activeProjectId && selectedProjectId !== activeProjectId
    ? "project-style"
    : String(ui.assetImageStyleSkillId ?? "project-style");
}

export const WORKBENCH_THEME_OPTIONS = [
  { id: "starlit", label: "星河紫", description: "当前配色", swatches: ["#a75cff", "#38c8ff", "#0b0a25"] },
  { id: "aurora", label: "极光蓝", description: "冷感高亮", swatches: ["#3ce8ff", "#5b7dff", "#061827"] },
  { id: "corona", label: "日冕金", description: "暖金影棚", swatches: ["#ffbf4b", "#ff5f6d", "#1d0d09"] },
  { id: "turquoise", label: "松石影棚", description: "青绿胶片", swatches: ["#20e3b2", "#52a8ff", "#061f1d"] },
  { id: "daylight", label: "月光白", description: "清透月白", swatches: ["#ffffff", "#86d7ff", "#1b2a41"] },
];
const DEFAULT_WORKBENCH_THEME_ID = "starlit";

const NAV_TABS = [
  { id: "home", label: "首页", icon: "home" },
  { id: "project", label: "项目", icon: "clapperboard" },
  { id: "prompts", label: "提示词", icon: "sparkles" },
  { id: "tools", label: "画布", icon: "wand" },
  { id: "director", label: "导演台", icon: "camera" },
  { id: "script", label: "剧本", icon: "book" },
  { id: "library", label: "资产库", icon: "archive" },
  { id: "team", label: "团队", icon: "users" },
];

const SEO_LANDING_PAGES = {
  home: {
    eyebrow: "AI视频生成工具",
    title: "专为短剧和漫剧创作的AI视频生成工具",
    summary:
      "灵曦剧场面向做漫剧和视频短剧的创作者，提供AI视频生成、剧本转分镜、小说改短剧、角色场景资产和短剧项目生产工作流。",
    keywords: ["AI视频生成", "剧本转分镜", "小说改短剧", "AI短剧/漫剧项目"],
    features: [
      ["AI视频生成", "围绕提示词、分镜图和角色参考生成短剧视频片段。"],
      ["剧本转分镜", "把小说、短剧剧本拆成镜头、角色、场景和道具线索。"],
      ["短剧项目生产", "把剧本、资产、分镜、视频和导出放进同一个项目流程。"],
    ],
    workflow: ["导入剧本", "生成分镜", "配置角色场景", "生成视频片段", "导出项目"],
    faqs: [
      ["灵曦剧场适合做什么？", "适合用来制作AI短剧、AI漫剧、视频短剧、漫画视频和批量分镜内容。"],
      ["不登录能看到哪些内容？", "公开页面展示产品能力、素材方向和制作流程，实际创建项目和生成内容需要登录。"],
      ["它和普通AI视频生成工具有什么区别？", "灵曦剧场更强调剧本、分镜、资产和项目管理的连续工作流，适合持续做短剧和漫剧。"],
    ],
  },
};

const GROUPS = [
  { key: "characters", group: "character", label: "角色", accent: "violet" },
  { key: "scenes", group: "scene", label: "场景", accent: "teal" },
  { key: "props", group: "prop", label: "道具", accent: "amber" },
  { key: "others", group: "other", label: "音频", accent: "slate" },
];

const INTERIOR_NAV_ITEMS = [
  { id: "overview", icon: "◼", label: "总览" },
  { id: "assets", icon: "◻", label: "资产" },
  { id: "episodes", icon: "▣", label: "剧集" },
  { id: "stats", icon: "◌", label: "统计" },
];

const ASSET_TABS = [
  { id: "character", icon: "◉", label: "角色", search: "搜索你所需要的角色" },
  { id: "scene", icon: "⌂", label: "场景", search: "搜索你所需要的场景" },
  { id: "prop", icon: "✣", label: "道具", search: "搜索你所需要的道具" },
  { id: "other", icon: "◈", label: "音频", search: "搜索你所需要的音频" },
];

const SINGLE_EPISODE_AI_TABLE_ORDER = ["script", "scenes", "characters", "props", "storyboards"];
const SINGLE_EPISODE_AI_LIVE_CELL_TEXT_LIMIT = 1200;

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
    importedCardClass: "portrait",
    emptyTitle: "场景资源库暂时还是空的",
    emptyCopy: "导入场景后会以卡片形式展示，并按最新时间排序。",
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
    importedCardClass: "portrait",
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
    label: "音频",
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
  const generationImages = Array.isArray(asset?.generationResult?.fixedImages)
    ? asset.generationResult.fixedImages
    : [];
  const latestGeneratedImage = generationImages.at(-1) ?? null;
  return resolvePreferredPreviewUrl(
    asset?.preview,
    asset?.previewUrl,
    asset?.fixedImageUrl,
    latestGeneratedImage?.previewUrl,
    latestGeneratedImage?.url,
    latestGeneratedImage?.src,
    asset?.latestVersion?.metadata?.fixedImageUrl,
    asset?.latestVersion?.previewUrl,
    asset?.latestVersion?.metadata?.previewUrl,
    asset?.sourceUrl,
  );
}

function normalizeImportedAssetGenerationStatus(status) {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  return normalized === "succeeded" ? "completed" : normalized;
}

function isAssetTransferRetryPending(value) {
  const result = value?.generationResult ?? value?.latestVersion?.metadata?.generationResult ?? value ?? {};
  const progressStage = String(
    result?.progressStage ??
      result?.progress_stage ??
      result?.snapshot?.progressStage ??
      result?.snapshot?.progress_stage ??
      result?.platform?.progressStage ??
      result?.platform?.progress_stage ??
      "",
  ).trim().toLowerCase();
  const transferStatus = String(
    result?.providerStatus?.transferStatus ??
      result?.provider_status?.transferStatus ??
      result?.snapshot?.providerStatus?.transferStatus ??
      result?.snapshot?.provider_status?.transferStatus ??
      result?.platform?.providerStatus?.transferStatus ??
      "",
  ).trim().toLowerCase();
  return progressStage === "asset_transfer_retry_pending" || transferStatus === "retry_pending";
}

function isAssetStorageManualReview(value) {
  const result = value?.generationResult ?? value?.latestVersion?.metadata?.generationResult ?? value ?? {};
  const status = String(result?.status ?? result?.workflowStatus ?? result?.platform?.workflowStatus ?? "").trim().toLowerCase();
  const failureCode = String(result?.failureCode ?? result?.failure?.failureCode ?? result?.failure?.code ?? "").trim().toLowerCase();
  const progressStage = String(result?.progressStage ?? result?.progress_stage ?? result?.snapshot?.progressStage ?? "").trim().toLowerCase();
  return failureCode === "provider_output_storage_failed" ||
    (status === "manual_review_required" && progressStage === "asset_transfer_manual_review");
}

function isImportedAssetGenerationTerminalStatus(status) {
  return new Set(["completed", "failed", "canceled", "manual_review_required", "result_unknown"])
    .has(normalizeImportedAssetGenerationStatus(status));
}

function resolveImportedAssetGenerationSnapshot(asset, localAsset = null) {
  const remoteGenerationResult =
    asset?.generationResult ??
    asset?.latestVersion?.metadata?.generationResult ??
    null;
  const localGenerationResult =
    localAsset?.generationResult ??
    localAsset?.latestVersion?.metadata?.generationResult ??
    null;
  const remoteGenerationTaskId = String(
    asset?.generationTaskId ??
      asset?.latestVersion?.metadata?.generationTaskId ??
      remoteGenerationResult?.taskId ??
      remoteGenerationResult?.generationTaskId ??
      remoteGenerationResult?.platform?.tasks?.[0]?.taskId ??
      "",
  ).trim();
  const localGenerationTaskId = String(
    localAsset?.generationTaskId ??
      localAsset?.taskId ??
      localGenerationResult?.taskId ??
      localGenerationResult?.generationTaskId ??
      localGenerationResult?.platform?.tasks?.[0]?.taskId ??
      "",
  ).trim();
  const remoteGenerationStatus = normalizeImportedAssetGenerationStatus(
    asset?.generationStatus ??
      asset?.latestVersion?.metadata?.generationStatus ??
      remoteGenerationResult?.status ??
      remoteGenerationResult?.workflowStatus ??
      remoteGenerationResult?.platform?.workflowStatus,
  );
  const localGenerationStatus = normalizeImportedAssetGenerationStatus(
    localAsset?.generationStatus ??
      localGenerationResult?.status ??
      localGenerationResult?.workflowStatus ??
      localGenerationResult?.platform?.workflowStatus,
  );
  const preferLocalTerminalSnapshot =
    Boolean(localGenerationTaskId) &&
    localGenerationTaskId === remoteGenerationTaskId &&
    isImportedAssetGenerationTerminalStatus(localGenerationStatus) &&
    !isImportedAssetGenerationTerminalStatus(remoteGenerationStatus);
  const generationTaskId = preferLocalTerminalSnapshot
    ? localGenerationTaskId || remoteGenerationTaskId
    : remoteGenerationTaskId || localGenerationTaskId;
  const generationStatus = preferLocalTerminalSnapshot
    ? localGenerationStatus
    : remoteGenerationStatus || localGenerationStatus || (generationTaskId ? "running" : "");
  const baseGenerationResult = preferLocalTerminalSnapshot
    ? localGenerationResult ?? remoteGenerationResult
    : remoteGenerationResult ?? localGenerationResult;
  const generationResult =
    baseGenerationResult && typeof baseGenerationResult === "object" && !Array.isArray(baseGenerationResult)
      ? {
          ...baseGenerationResult,
          ...(generationStatus ? { status: generationStatus } : {}),
          ...(generationTaskId ? { taskId: generationTaskId } : {}),
        }
      : generationStatus || generationTaskId
        ? {
            ...(generationStatus ? { status: generationStatus } : {}),
            ...(generationTaskId ? { taskId: generationTaskId } : {}),
          }
        : null;
  return {
    generationResult,
    generationStatus,
    generationTaskId,
  };
}

function resolveImportedAssetGenerationResult(asset, ui) {
  const assetId = String(asset?.id ?? asset?.assetId ?? "").trim();
  if (asset?.generationResult) {
    return asset.generationResult;
  }
  if (asset?.latestVersion?.metadata?.generationResult) {
    return asset.latestVersion.metadata.generationResult;
  }
  if (asset?.generationStatus) {
    return {
      status: asset.generationStatus,
      taskId: asset?.generationTaskId ?? null,
    };
  }
  return (assetId && ui?.episodeBatchResults?.[assetId]) || null;
}

function resolveImportedAssetGenerationStatus(asset, ui) {
  const result = resolveImportedAssetGenerationResult(asset, ui);
  if (isAssetTransferRetryPending(result)) {
    return "asset_transfer_retry_pending";
  }
  return String(
    result?.status ??
      result?.workflowStatus ??
      result?.platform?.workflowStatus ??
      asset?.generationStatus ??
      "",
  ).trim().toLowerCase();
}

function isEpisodeSourcedImportedAsset(asset) {
  const generationResult = asset?.generationResult ?? asset?.latestVersion?.metadata?.generationResult ?? null;
  if (
    generationResult &&
    typeof generationResult === "object" &&
    !Array.isArray(generationResult) &&
    (
      generationResult.assetId ||
      generationResult.promptPreview ||
      generationResult.selectionContext
    )
  ) {
    return true;
  }
  return [
    asset?.source,
    asset?.assetSource,
    asset?.sourceType,
    asset?.source_type,
    asset?.taskType,
    asset?.task_type,
    asset?.generationResult?.sourceType,
    asset?.generationResult?.source_type,
    asset?.generationResult?.taskType,
    asset?.generationResult?.task_type,
    asset?.latestVersion?.metadata?.source,
    asset?.latestVersion?.metadata?.sourceType,
    asset?.latestVersion?.metadata?.source_type,
    asset?.latestVersion?.metadata?.taskType,
    asset?.latestVersion?.metadata?.task_type,
  ].some((source) => {
    const normalized = String(source ?? "").trim().toLowerCase();
    return normalized === "episode" || normalized.startsWith("episode_") || normalized.includes("episode_asset");
  });
}

function renderImportedAssetGenerationBadge(status) {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (normalized === "asset_transfer_retry_pending") {
    return '<span class="asset-generation-badge running"><i aria-hidden="true"></i>存储超时，正在重试</span>';
  }
  if (normalized === "provider_output_storage_failed" || normalized === "asset_transfer_manual_review") {
    return '<span class="asset-generation-badge failed">存储失败，等待人工处理</span>';
  }
  if (isImportedAssetGeneratingStatus(normalized)) {
    return '<span class="asset-generation-badge running"><i aria-hidden="true"></i>生成中</span>';
  }
  if (["completed", "succeeded"].includes(normalized)) {
    return '<span class="asset-generation-badge done">已完成</span>';
  }
  if (["manual_review_required", "result_unknown"].includes(normalized)) {
    return '<span class="asset-generation-badge failed">待复核</span>';
  }
  if (isAssetGeneratorFailureStatus(normalized)) {
    return '<span class="asset-generation-badge failed">生成失败</span>';
  }
  return "";
}

function isImportedAssetGeneratingStatus(status) {
  return ["created", "queued", "running", "generating", "pending", "submitted", "external_submitted", "accepted", "provider_submitted", "processing"]
    .includes(String(status ?? "").trim().toLowerCase());
}

function renderImportedAssetGenerationHint(asset, ui) {
  const result = resolveImportedAssetGenerationResult(asset, ui);
  const status = resolveImportedAssetGenerationStatus(asset, ui);
  const taskId = String(result?.taskId ?? result?.platform?.tasks?.[0]?.taskId ?? asset?.generationTaskId ?? "").trim();
  if (!status && !taskId) {
    return "";
  }
  const label = status === "asset_transfer_retry_pending"
    ? "存储超时，正在重试"
    : ["completed", "succeeded"].includes(status)
    ? "任务已完成"
    : ["manual_review_required", "result_unknown"].includes(status)
      ? "任务待复核"
    : isAssetGeneratorFailureStatus(status)
      ? "任务未完成"
      : "任务生成中";
  return `<small class="asset-generation-hint">${escapeHtml(label)}</small>`;
}

function resolveAssetGeneratorTaskSummary(asset) {
  const metadata = asset?.latestVersion?.metadata ?? {};
  const result = asset?.generationResult ?? metadata?.generationResult ?? null;
  const resultAsset = Array.isArray(result?.resultAssets) ? result.resultAssets[0] : null;
  const status = String(
    result?.status ??
      result?.workflowStatus ??
      result?.platform?.workflowStatus ??
      asset?.generationStatus ??
      metadata?.generationStatus ??
      "",
  ).trim().toLowerCase();
  const taskId = String(
    result?.taskId ??
      result?.generationTaskId ??
      result?.platform?.tasks?.[0]?.taskId ??
      asset?.generationTaskId ??
      metadata?.generationTaskId ??
      "",
  ).trim();
  const previewUrl = resolvePreferredPreviewUrl(
    result?.fixedImages?.[0]?.previewUrl,
    result?.fixedImages?.[0]?.thumbnailUrl,
    result?.fixedImages?.[0]?.thumbnail_url,
    result?.fixedImages?.[0]?.url,
    result?.fixedImages?.[0]?.src,
    result?.fixedImages?.[0]?.sourceUrl,
    result?.fixedImages?.[0]?.source_url,
    result?.version?.previewUrl,
    result?.version?.metadata?.previewUrl,
    result?.result?.imageUrl,
    result?.result?.image_url,
    result?.result?.previewUrl,
    result?.result?.thumbnailUrl,
    result?.result?.fixedImageUrl,
    result?.imageUrl,
    result?.image_url,
    result?.previewUrl,
    result?.thumbnailUrl,
    result?.fixedImageUrl,
    resultAsset?.previewUrl,
    resultAsset?.sourceUrl,
    resultAsset?.downloadUrl,
    resultAsset?.url,
  );
  const statusLabel = isAssetTransferRetryPending(result)
    ? "存储超时，正在重试"
    : isAssetStorageManualReview(result)
      ? "存储失败，等待人工处理"
      : ["completed", "succeeded"].includes(status)
    ? "已完成"
    : ["manual_review_required", "result_unknown"].includes(status)
      ? "待复核"
    : isAssetGeneratorFailureStatus(status)
      ? "生成失败"
      : status
        ? "生成中"
        : "";
  return {
    status,
    statusLabel,
    taskId,
    previewUrl,
  };
}

function isAssetGeneratorFailureStatus(status) {
  return [
    "failed",
    "error",
    "rejected",
    "timeout",
    "timed_out",
    "canceled",
    "cancelled",
    "manual_review_required",
    "result_unknown",
  ].includes(String(status ?? "").trim().toLowerCase());
}

function isProviderDiagnosticLikeMessage(message) {
  const value = String(message ?? "").trim();
  if (!value) {
    return false;
  }
  if (/模型供应商返回失败[:：]/.test(value)) {
    return true;
  }
  if (/[A-Za-z]{3,}/.test(value)) {
    return true;
  }
  if (/[a-z0-9_.-]+:[a-z0-9_.-]+/i.test(value)) {
    return true;
  }
  return false;
}

function resolveContentSafetyFailureMessage(message) {
  const value = String(message ?? "").trim();
  if (!value) {
    return "";
  }
  if (/(血腥|残肢|尸体|断肢|头颅破碎|重度暴力|明显的血|不适合生成|内容安全|安全策略|审核拒绝|违规|敏感内容|content policy|safety|moderation)/i.test(value)) {
    return "提示词包含血腥、残肢或重度暴力内容，请改成非血腥的战后遗迹、诡异荒城或氛围场景后重试。";
  }
  return "";
}

function resolveAssetGeneratorTaskFailureMessage(asset) {
  const task = asset?.generationResult ?? asset ?? null;
  const status = String(task?.status ?? task?.workflowStatus ?? task?.platform?.workflowStatus ?? "").toLowerCase();
  const failureCode = String(task?.failureCode ?? task?.failure?.failureCode ?? "").trim();
  if (isAssetTransferRetryPending(task)) {
    return "存储超时，正在重试";
  }
  if (isAssetStorageManualReview(task)) {
    return "存储失败，等待人工处理";
  }
  if (
    ["manual_review_required", "result_unknown"].includes(status) ||
    ["provider_submission_ambiguous", "provider_result_unknown", "provider_output_persist_failed", "worker_crashed_after_external_start"].includes(failureCode)
  ) {
    if (failureCode === "provider_output_persist_failed") {
      return "已保存到平台存储，资产记录与积分状态等待后台复核";
    }
    return "供应商结果与积分状态尚未确认，等待后台复核，请勿重复提交";
  }
  const apiKeyEnv = String(task?.failure?.apiKeyEnv ?? task?.details?.apiKeyEnv ?? "").trim();
  const displayMessage = String(task?.failure?.displayMessage ?? "").trim();
  const providerMessage = String(task?.failure?.providerMessage ?? task?.failure?.errorMessage ?? "").trim();
  const contentSafetyMessage = resolveContentSafetyFailureMessage(displayMessage) || resolveContentSafetyFailureMessage(providerMessage);
  if (contentSafetyMessage) {
    return contentSafetyMessage;
  }
  if (displayMessage) {
    if (isProviderDiagnosticLikeMessage(displayMessage)) {
      return "任务失败，请稍后重试";
    }
    return apiKeyEnv ? `${displayMessage} 缺失项：${apiKeyEnv}` : displayMessage;
  }
  const finalizeMessage = (
    {
      provider_output_persist_failed: "已保存到平台存储，正在等待后台补写资产记录",
      provider_output_upload_failed: "存储超时，正在重试",
      provider_output_download_failed: "存储超时，正在重试",
    }[failureCode] ?? ""
  );
  if (finalizeMessage) {
    return finalizeMessage;
  }
  return failureCode || "任务失败，请稍后重试";
}

function resolveAssetGeneratorSnapshotReferenceUrl(reference) {
  const storageObjectId = String(reference?.storageObjectId ?? "").trim();
  if (storageObjectId) {
    return `/api/storage/objects/${encodeURIComponent(storageObjectId)}/content?proxy=1`;
  }
  return String(
    reference?.url ?? reference?.previewUrl ?? reference?.publicUrl ?? "",
  ).trim();
}

function renderAssetGeneratorTaskOverview(asset, fallbackPreviewUrl = "", placeholderArt = "", options = {}) {
  const summary = resolveAssetGeneratorTaskSummary(asset);
  const metadataGenerationResult = asset?.latestVersion?.metadata?.generationResult;
  const generationResult = asset?.generationResult && typeof asset.generationResult === "object"
    ? asset.generationResult
    : metadataGenerationResult && typeof metadataGenerationResult === "object"
      ? metadataGenerationResult
      : {};
  const snapshotPrompt = String(generationResult.prompt ?? asset?.prompt ?? "").trim();
  const snapshotModel = String(generationResult.model ?? "").trim();
  const snapshotReferences = [
    ...(Array.isArray(generationResult.parameters?.references) ? generationResult.parameters.references : []),
    ...(Array.isArray(generationResult.parameters?.quickReferences) ? generationResult.parameters.quickReferences : []),
    ...(Array.isArray(generationResult.parameters?.referenceImages) ? generationResult.parameters.referenceImages : []),
    generationResult.parameters?.imageReference,
  ].filter(Boolean);
  const snapshotReferenceUrl = snapshotReferences
    .map(resolveAssetGeneratorSnapshotReferenceUrl)
    .find(Boolean) ?? "";
  const completed = ["completed", "succeeded"].includes(summary.status);
  const previewUrl = resolvePreferredPreviewUrl(
    summary.previewUrl,
    ...(completed && summary.taskId
      ? [asset?.previewUrl, asset?.sourceUrl, fallbackPreviewUrl]
      : []),
  );
  const failed = isAssetGeneratorFailureStatus(summary.status);
  const failureMessage = failed ? resolveAssetGeneratorTaskFailureMessage(asset) : "";
  const statusBadge = summary.status ? renderImportedAssetGenerationBadge(summary.status) : "";
  const statusText = summary.statusLabel || "未创建任务";
  const reviewRequired = ["manual_review_required", "result_unknown"].includes(summary.status);
  const helperText = previewUrl
    ? "已返回预览图"
    : failed
      ? "本次任务未返回可用图片"
      : summary.taskId
        ? `任务 ID · ${summary.taskId}`
        : summary.status
          ? "模型正在返回图片"
          : "当前还没有生成任务";
  const previewStateClass = previewUrl
    ? "has-image"
    : summary.status && !failed
      ? "is-generating"
      : "is-empty";
  const actionLabel = options.isSubmitting ? "重新生成中" : "重新生成";
  const storyboardAction =
    options.showStoryboardAction === true &&
    completed &&
    Boolean(previewUrl) &&
    String(options.storyboardId ?? "").trim() &&
    String(summary.taskId ?? "").trim()
      ? `
        <div class="asset-generator-task-actions">
          <button
            class="asset-generator-task-action"
            type="button"
            data-action="set-storyboard-generator-image"
            data-storyboard-id="${escapeAttr(String(options.storyboardId))}"
            data-task-id="${escapeAttr(String(summary.taskId))}"
          >设为故事板</button>
        </div>
      `
      : "";
  return `
    <section class="asset-generator-task-overview ${failed ? "is-failed" : ""} ${failed && options.showRetryForm === false ? "is-summary-only" : ""}" aria-label="任务概览">
      <header class="asset-generator-task-head">
        <div>
          <span>任务概览</span>
          <strong>${escapeHtml(statusText)}</strong>
        </div>
        ${statusBadge}
      </header>
      ${failed ? `
        <div class="asset-generator-task-compact-status">
          <span>任务 ${escapeHtml(summary.taskId || "未记录")}</span>
          <strong>${reviewRequired ? "复核说明" : "失败原因"}：${escapeHtml(failureMessage || helperText)}</strong>
        </div>
        ${previewUrl ? `<div class="asset-generator-task-preview has-image"><img src="${escapeHtml(resolveApiUrl(previewUrl))}" alt="任务返回图片" /></div>` : ""}
      ` : `
        <div class="asset-generator-task-preview ${previewStateClass}">
          ${previewUrl
            ? `<img src="${escapeHtml(resolveApiUrl(previewUrl))}" alt="任务返回图片" />`
            : summary.status
              ? '<div class="asset-generating-placeholder large" aria-hidden="true"><span></span><span></span><span></span><strong>图片生成中</strong></div>'
              : `<img src="${escapeHtml(placeholderArt)}" alt="任务等待中" />`}
        </div>
        <dl class="asset-generator-task-meta">
          <div><dt>任务状态</dt><dd>${escapeHtml(statusText)}</dd></div>
          <div><dt>任务编号</dt><dd>${escapeHtml(summary.taskId || "等待创建")}</dd></div>
          <div><dt>返回结果</dt><dd>${escapeHtml(helperText)}</dd></div>
        </dl>
        ${storyboardAction}
      `}
      ${
        failed && options.showRetryForm !== false
          ? `
      <div class="asset-generator-task-retry-form">
        <strong>重新生成</strong>
        ${renderAssetGeneratorComposer({
          description: options.currentPrompt || snapshotPrompt,
          previewUrl: options.retryPreviewUrl || options.currentPreviewUrl || snapshotReferenceUrl,
          referenceItems: options.referenceItems,
          modelCode: options.modelCode || snapshotModel,
          modelLabel: options.modelLabel || snapshotModel || "选择模型",
          modelOptions: options.modelOptions,
          openGenerationSelectMenu: options.openGenerationSelectMenu,
          generatorSettings: options.generatorSettings,
          action: options.retryAction || "regenerate-asset-generator",
          credits: options.credits,
          isSubmitting: options.isSubmitting,
          promptInputId: options.retryPromptInputId || "asset-generator-retry-prompt-input",
          referenceInputId: options.retryReferenceInputId || "asset-generator-retry-reference-input",
        })}
      </div>
      `
          : ""
      }
    </section>
  `;
}

function resolveStoryboardGeneratorTaskAsset(ui) {
  const storyboardId = String(ui.assetGeneratorStoryboardId ?? ui.selectedStoryboardId ?? "").trim();
  if (!storyboardId) {
    return null;
  }
  const storyboard = [
    ui.selectedStoryboard,
    ...(Array.isArray(ui.storyboards) ? ui.storyboards : []),
    ...Object.values(ui.episodeStoryboardMap ?? {}).flatMap((items) => Array.isArray(items) ? items : []),
  ].find((item) => String(item?.id ?? "").trim() === storyboardId);
  const generatorResult = storyboard?.generationState?.lastSubmission?.sourceSurface === "storyboard-generator-modal"
    ? storyboard.generationState.lastSubmission
    : null;
  const historyEntries = ui.storyboardConversationHistory?.[`image:${storyboardId}`];
  const historyEntry = Array.isArray(historyEntries) ? historyEntries.filter(Boolean).at(-1) ?? null : null;
  const currentResult = ui.imageGenerationResult ?? null;
  const currentStoryboardId = String(
    currentResult?.storyboardId ??
      currentResult?.selectionContext?.selectedStoryboardId ??
      currentResult?.selectionContext?.storyboardId ??
      "",
  ).trim();
  const generationResult = generatorResult ?? historyEntry ?? (currentStoryboardId === storyboardId ? currentResult : null);
  if (!generationResult) {
    return null;
  }
  const taskId = String(
    generationResult.taskId ??
      generationResult.generationTaskId ??
      generationResult.platform?.tasks?.[0]?.taskId ??
      generationResult.id ??
      "",
  ).trim();
  const status = String(
    generationResult.status ??
      generationResult.workflowStatus ??
      generationResult.platform?.workflowStatus ??
      "",
  ).trim();
  if (!taskId && !status) {
    return null;
  }
  return {
    id: storyboardId,
    source: "generated",
    generationStatus: status,
    generationTaskId: taskId,
    generationResult,
    prompt: generationResult.promptPreview ?? generationResult.prompt ?? "",
  };
}

export function renderStoryboardGeneratorTaskOverview(ui) {
  const taskAsset = resolveStoryboardGeneratorTaskAsset(ui);
  if (!taskAsset) {
    return "";
  }
  const generatorConfig = resolveAssetGeneratorModelConfig(ui);
  const storyboardReferences = [
    ...(ui.assetGeneratorStoryboardReferences ?? []),
    ...(ui.assetGeneratorStoryboardUploadReferences ?? []),
  ];
  return renderAssetGeneratorTaskOverview(taskAsset, "", "", {
    showStoryboardAction: true,
    showRetryForm: false,
    storyboardId: taskAsset.id,
    isSubmitting: ui.assetGeneratorSubmitting === true,
    modelCode: generatorConfig.modelCode,
    modelLabel: generatorConfig.modelLabel,
    modelOptions: generatorConfig.models.map((model) => [model.code, model.label || model.code]),
    openGenerationSelectMenu: ui.openGenerationSelectMenu,
    generatorSettings: buildCanvasImageSettingsState(generatorConfig.selected?.raw ?? null, {
      ...(ui.assetGeneratorParameterValues ?? {}),
      imageResolution: generatorConfig.resolution,
      quality: generatorConfig.resolution,
      resolution: generatorConfig.resolution,
      imageAspectRatio: generatorConfig.aspectRatio,
      aspectRatio: generatorConfig.aspectRatio,
    }),
    credits: generatorConfig.credits ?? 90,
    currentPrompt: ui.assetGeneratorPrompt ?? "",
    referenceItems: storyboardReferences,
    retryAction: "submit-asset-generator",
    retryPromptInputId: "asset-generator-storyboard-retry-prompt-input",
    retryReferenceInputId: "asset-generator-storyboard-retry-reference-input",
  });
}

function normalizeProjectOtherAssetMediaType(value, fallback = "audio") {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "image" || normalized === "video" || normalized === "audio") {
    return normalized;
  }
  return fallback;
}

function resolveProjectOtherAssetMediaLabel(mediaType) {
  const normalized = normalizeProjectOtherAssetMediaType(mediaType, "audio");
  if (normalized === "image") {
    return "图片";
  }
  if (normalized === "video") {
    return "视频";
  }
  return "音频";
}

function resolveImportedAssetAudioUrl(asset) {
  const candidates = [
    asset?.audioUrl,
    asset?.sourceUrl,
    asset?.preview,
    asset?.previewUrl,
    asset?.latestVersion?.metadata?.sourceUrl,
    asset?.latestVersion?.previewUrl,
    asset?.latestVersion?.metadata?.previewUrl,
  ];
  const mimeType = String(asset?.mimeType ?? asset?.latestVersion?.metadata?.mimeType ?? "").trim().toLowerCase();
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (!value) {
      continue;
    }
    if (
      mimeType.startsWith("audio/") ||
      /^data:audio\//i.test(value) ||
      /\.(mp3|wav|m4a|aac)(?:[?#]|$)/i.test(value)
    ) {
      return value;
    }
  }
  return "";
}

function resolveImportedAssetAudioCoverUrl(asset) {
  const audioUrl = resolveImportedAssetAudioUrl(asset);
  const imageMimeType = String(
    asset?.fixedImageMimeType ??
      asset?.coverMimeType ??
      asset?.latestVersion?.metadata?.fixedImageMimeType ??
      asset?.latestVersion?.metadata?.coverMimeType ??
      "",
  )
    .trim()
    .toLowerCase();
  const candidates = [
    asset?.fixedImageUrl,
    asset?.latestVersion?.metadata?.fixedImageUrl,
    asset?.latestVersion?.metadata?.previewUrl,
    asset?.preview,
    asset?.previewUrl,
    asset?.latestVersion?.previewUrl,
    asset?.sourceUrl,
  ];
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (!value || value === audioUrl) {
      continue;
    }
    if (/^data:audio\//i.test(value) || /\.(mp3|wav|m4a|aac)(?:[?#]|$)/i.test(value)) {
      continue;
    }
    if (
      !imageMimeType.startsWith("image/") &&
      !/^data:image\//i.test(value) &&
      !/\.(?:png|jpe?g|webp|gif|avif|svg)(?:[?#]|$)/i.test(value)
    ) {
      continue;
    }
    return value;
  }
  return "";
}

function isAudioLibraryAssetRecord(asset) {
  return Boolean(
    resolveImportedAssetAudioUrl(asset) ||
    String(asset?.mimeType ?? asset?.latestVersion?.mimeType ?? asset?.latestVersion?.metadata?.mimeType ?? "")
      .trim()
      .toLowerCase()
      .startsWith("audio/"),
  );
}
export function renderProjectDetail(context = {}) {
  const { state: rawState = {}, ui = {}, session = { user: { phone: "" } } } = context;
  const state = rawState && typeof rawState === "object" ? rawState : {};
  const detailState = getProjectDetailState(state);
  const progress = getProgress(state);
  const requestedNavTab = ui.activeNavTab ?? "home";
  const activeNavTab = requestedNavTab === "new-canvas" && !isNewCanvasEnabled(session) ? "home" : requestedNavTab;
  const creditBalance = resolveDisplayedCreditBalance(ui, session);
  const taskCenterActiveCount = countActiveTaskCenterTasks(ui);

  if (activeNavTab === "community") {
    return `
      <section class="production-community-window">
        ${renderCommunityWindowHeader(session)}
        ${renderCommunityPage({ ui, session })}
        ${renderStatusToast(Array.isArray(ui.toastQueue) ? ui.toastQueue : ui.toast, "community-window-toast")}
      </section>
    `;
  }

  if (activeNavTab === "media-library") {
    return `
      <section class="production-community-window production-media-library-window">
        ${renderCommunityWindowHeader(session, { title: "素材库" })}
        ${renderPersonalMediaLibraryPage({ ui, session })}
        ${renderStatusToast(Array.isArray(ui.toastQueue) ? ui.toastQueue : ui.toast, "community-window-toast")}
      </section>
    `;
  }

  if (activeNavTab === "project" && ui.projectPanelMode === "detail") {
    const detailContent = renderPageBoundary("项目工作台", activeNavTab, () => `
      ${renderProjectInteriorShell({ state, ui, detailState })}
    `);
    return `
      <section class="production-workbench">
        ${renderWorkbenchRail(activeNavTab, session, ui)}
        <section class="workbench-main detail-mode">
          ${renderGlobalStatusbar(session, {
            hideBrand: true,
            creditBalance,
            membershipStatus: ui.membershipStatus ?? null,
            selectedThemeId: ui.selectedWorkbenchTheme,
            themeMenuOpen: ui.themeMenuOpen,
            customerSupportConfig: ui.customerSupportConfig,
            announcementUnread: ui.announcementUnread === true,
            taskCenterActiveCount,
          })}
          ${detailContent}
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
        submitLabel: resolveScriptModalSubmitLabel(ui),
        mode: ui.scriptModalMode ?? "full",
        lookControlsHtml: renderScriptConversionSkillControl(ui),
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
    ${renderGlobalOverlays(ui, session)}
  `;
  }

  if (activeNavTab === "project" && ui.projectPanelMode === "episode-workbench") {
    const episodeWorkbenchContent = renderPageBoundary("剧集工作台", activeNavTab, () =>
      renderEpisodeWorkbenchScreen({ state, ui, session }),
    );
    return `
      <section class="production-workbench">
        ${renderWorkbenchRail(activeNavTab, session, ui)}
        <section class="workbench-main detail-mode episode-workbench-main">
          ${renderGlobalStatusbar(session, {
            showEpisodeReturn: true,
            showEpisodeStoryboardJump: ui.museScopeMode === "assets",
            showEpisodeAssetJump: ui.museScopeMode !== "assets",
            creditBalance,
            membershipStatus: ui.membershipStatus ?? null,
            selectedThemeId: ui.selectedWorkbenchTheme,
            themeMenuOpen: ui.themeMenuOpen,
            customerSupportConfig: ui.customerSupportConfig,
            announcementUnread: ui.announcementUnread === true,
            taskCenterActiveCount,
          })}
          ${episodeWorkbenchContent}
        </section>
      </section>
      ${renderAssetImageStyleSkillModal(ui, state)}
      ${renderAssetExtractModal({
        activeTab: ui.scriptTab,
        show: ui.isScriptModalOpen,
        uploadNotice: ui.uploadNotice,
        hasProject: Boolean(state.project),
        defaultScript: ui.scriptModalMode === "manual" ? (ui.scriptManualDraft ?? "") : (ui.defaultScript ?? ""),
        busy: ui.busy,
        submitAction: ui.scriptSubmitAction ?? "import-script-document",
        submitLabel: resolveScriptModalSubmitLabel(ui),
        mode: ui.scriptModalMode ?? "full",
        lookControlsHtml: renderScriptConversionSkillControl(ui),
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
      ${ui.assetGeneratorModal ? renderAssetGeneratorModal(ui) : ""}
      ${ui.assetGeneratorUploading ? renderAssetGeneratorUploadModal() : ""}
      ${renderSingleEpisodeAiPreview(ui)}
      ${renderGlobalOverlays(ui, session)}
    `;
  }

  const toolsModeClass = isCanvasNavTab(activeNavTab)
    ? ` tools-mode ${ui.canvasProjectView === "detail" ? "tools-canvas-detail-mode" : "tools-canvas-list-mode"}`
    : "";
  const directorModeClass = activeNavTab === "director" ? " director-mode" : "";
  return `
    <section class="production-workbench">
      ${renderWorkbenchRail(activeNavTab, session, ui)}

      <section class="workbench-main ${activeNavTab === "home" ? "home-mode" : ""}${directorModeClass}${toolsModeClass}">
        ${renderGlobalStatusbar(session, {
          creditBalance,
          membershipStatus: ui.membershipStatus ?? null,
          selectedThemeId: ui.selectedWorkbenchTheme,
          themeMenuOpen: ui.themeMenuOpen,
          customerSupportConfig: ui.customerSupportConfig,
          announcementUnread: ui.announcementUnread === true,
          taskCenterActiveCount,
        })}
        ${renderPageBoundary(navTabLabel(activeNavTab), activeNavTab, () =>
          renderMainPanel({ state, ui, session, detailState, progress, activeNavTab }),
        )}
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
      submitLabel: resolveScriptModalSubmitLabel(ui),
      mode: ui.scriptModalMode ?? "full",
      lookControlsHtml: renderScriptConversionSkillControl(ui),
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
    ${activeNavTab === "library" && ui.assetGeneratorTarget === "team" && ui.assetGeneratorModal ? renderAssetGeneratorModal(ui) : ""}
    ${activeNavTab === "library" && ui.assetImportModalSource === "team" && ui.assetImportModal ? renderAssetImportModal(ui) : ""}
    ${activeNavTab === "library" ? renderImportedAssetRenameModal(ui) : ""}
    ${activeNavTab === "library" ? renderImportedAssetDeleteModal(ui) : ""}
    ${renderGlobalOverlays(ui, session)}
  `;
}

function renderGlobalOverlays(ui = {}, session = {}) {
  return `<div data-workbench-global-overlays style="display:contents">
    ${renderScriptConversionSkillModal(ui)}
    ${renderEpisodePromptSkillModal({
      show: ui.episodePromptSkillModalOpen === true && ui.isSingleEpisodeModalOpen === true,
      sourceTab: ui.episodePromptSkillSourceTab,
      activeCategory: ui.episodePromptSkillCategory,
      officialSkills: ui.episodePromptOfficialSkills,
      privateSkills: ui.episodePromptPrivateSkills,
      draftSelections: ui.episodePromptSkillDraftIds,
      loading: ui.episodePromptSkillLoading,
    })}
    ${renderCanvasTextSkillModal({
      show: ui.canvasTextSkillModalOpen === true && ui.canvasProjectView === "detail",
      sourceTab: ui.canvasTextSkillSourceTab,
      activeCategory: ui.canvasTextSkillCategory ?? ui.canvasTextSkillDraftCategory,
      officialSkills: ui.canvasTextOfficialSkills,
      privateSkills: ui.canvasTextPrivateSkills,
      draftSkillId: ui.canvasTextSkillDraftId,
      loading: ui.canvasTextSkillsLoading,
    })}
    ${renderStoryboardPromptSkillModal(ui)}
    ${renderTaskCenterDrawer(ui)}
    ${renderCreditLedgerDrawer(ui)}
    ${renderGlobalPricingModal(ui)}
    ${renderOverlayStatusToast(ui)}
    ${renderAnnouncementPanel(ui)}
    ${renderAccountSettingsDrawer(ui, session)}
    ${renderInviteGiftDrawer(ui)}
  </div>`;
}

function countActiveTaskCenterTasks(ui = {}) {
  const activeStatuses = new Set(["queued", "running", "pending", "submitted", "external_submitted", "accepted", "provider_submitted", "processing"]);
  return Object.values(ui.taskCenterTasksById ?? {})
    .filter((task) => activeStatuses.has(String(task?.status ?? task?.workflowStatus ?? "").trim().toLowerCase()))
    .length;
}

function renderTaskCenterDrawer(ui = {}) {
  if (!ui.taskCenterOpen) {
    return "";
  }
  const tasksById = ui.taskCenterTasksById ?? {};
  const taskIds = Array.isArray(ui.taskCenterTaskOrder) ? ui.taskCenterTaskOrder : [];
  const tasks = taskIds.map((taskId) => tasksById[taskId]).filter(Boolean);
  const selectedTask = tasksById[ui.taskCenterSelectedTaskId] ?? tasks[0] ?? null;
  const meta = ui.taskCenterMeta ?? {};
  const page = Math.max(1, Number(meta.page ?? ui.taskCenterPage ?? 1));
  const totalPages = Math.max(1, Number(meta.totalPages ?? 1));
  const total = Math.max(0, Number(meta.total ?? tasks.length));
  const loading = ui.taskCenterLoading === true;
  const error = String(ui.taskCenterError ?? "").trim();
  return `
    <div class="task-center-backdrop" data-action="close-task-center" aria-hidden="true"></div>
    <aside class="task-center-drawer" role="dialog" aria-modal="true" aria-labelledby="task-center-title">
      <header class="task-center-header">
        <div class="task-center-heading">
          <span class="task-center-heading-icon" aria-hidden="true">${renderStatusbarActionIcon("tasks")}</span>
          <div>
            <h2 id="task-center-title">任务中心</h2>
            <span>${escapeHtml(String(total))} 个任务</span>
          </div>
        </div>
        <div class="task-center-header-actions">
          <button class="task-center-icon-button task-center-refresh" type="button" data-action="refresh-task-center" aria-label="刷新任务" title="刷新任务" ${loading ? "disabled" : ""}>${renderTaskCenterUtilityIcon("refresh")}</button>
          <button class="task-center-icon-button task-center-close" type="button" data-action="close-task-center" aria-label="关闭任务中心" title="关闭任务中心">${renderTaskCenterUtilityIcon("close")}</button>
        </div>
      </header>
      <div class="task-center-toolbar">
        <div class="task-center-segments" role="group" aria-label="任务状态">
          ${renderTaskCenterFilterButton("all", "全部", ui.taskCenterStatusFilter ?? "all", "status")}
          ${renderTaskCenterFilterButton("active", "进行中", ui.taskCenterStatusFilter ?? "all", "status")}
          ${renderTaskCenterFilterButton("completed", "已完成", ui.taskCenterStatusFilter ?? "all", "status")}
          ${renderTaskCenterFilterButton("failed", "失败", ui.taskCenterStatusFilter ?? "all", "status")}
        </div>
        <div class="task-center-kind-filter" role="group" aria-label="任务类型">
          ${renderTaskCenterFilterButton("all", "全部类型", ui.taskCenterKindFilter ?? "all", "kind")}
          ${renderTaskCenterFilterButton("image", "图片", ui.taskCenterKindFilter ?? "all", "kind")}
          ${renderTaskCenterFilterButton("video", "视频", ui.taskCenterKindFilter ?? "all", "kind")}
          ${renderTaskCenterFilterButton("team_asset", "团队资产", ui.taskCenterKindFilter ?? "all", "kind")}
        </div>
      </div>
      ${error ? `<div class="task-center-error" role="alert">${escapeHtml(error)}</div>` : ""}
      <div class="task-center-workspace ${selectedTask ? "has-selection" : ""}">
        <section class="task-center-list-pane" aria-label="任务列表">
          <div class="task-center-list-head" aria-hidden="true">
            <span>任务</span><span>状态</span><span>提交时间</span>
          </div>
          <div class="task-center-list" aria-live="polite">
            ${loading && !tasks.length ? renderTaskCenterLoadingRows() : ""}
            ${!loading && !tasks.length ? `<div class="task-center-empty"><strong>暂无任务</strong><span>当前筛选条件下没有记录。</span></div>` : ""}
            ${tasks.map((task) => renderTaskCenterRow(task, selectedTask)).join("")}
          </div>
          <footer class="task-center-pagination">
            <span>第 ${escapeHtml(String(page))} / ${escapeHtml(String(totalPages))} 页</span>
            <div>
              <button type="button" data-action="change-task-center-page" data-page="${escapeAttr(String(page - 1))}" ${page > 1 && !loading ? "" : "disabled"}>上一页</button>
              <button type="button" data-action="change-task-center-page" data-page="${escapeAttr(String(page + 1))}" ${page < totalPages && !loading ? "" : "disabled"}>下一页</button>
            </div>
          </footer>
        </section>
        ${renderTaskCenterDetail(selectedTask)}
      </div>
    </aside>
  `;
}

function renderTaskCenterFilterButton(value, label, selectedValue, type) {
  return `<button class="${value === selectedValue ? "active" : ""}" type="button" data-action="set-task-center-${escapeAttr(type)}" data-${escapeAttr(type)}="${escapeAttr(value)}">${escapeHtml(label)}</button>`;
}

function renderTaskCenterRow(task = {}, selectedTask = null) {
  const taskId = String(task.taskId ?? task.id ?? "").trim();
  const status = taskCenterStatusMeta(task);
  const selectedId = String(selectedTask?.taskId ?? selectedTask?.id ?? "").trim();
  const title = taskCenterTaskTitle(task);
  return `
    <button class="task-center-row ${taskId === selectedId ? "active" : ""}" type="button" data-action="select-task-center-task" data-task-id="${escapeAttr(taskId)}" aria-pressed="${taskId === selectedId ? "true" : "false"}">
      <span class="task-center-row-main">
        <span class="task-center-kind-mark ${escapeAttr(taskCenterMediaKind(task))}" aria-hidden="true">${taskCenterMediaKind(task) === "video" ? "影" : "图"}</span>
        <span class="task-center-row-copy"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(taskId)}</small></span>
      </span>
      <span class="task-center-status ${escapeAttr(status.tone)}"><i aria-hidden="true"></i>${escapeHtml(status.label)}</span>
      <time>${escapeHtml(formatTaskCenterTime(task.submittedAt ?? task.createdAt, true))}</time>
    </button>
  `;
}

function renderTaskCenterDetail(task) {
  if (!task) {
    return `<section class="task-center-detail task-center-detail-empty"><strong>选择一个任务查看详情</strong></section>`;
  }
  const taskId = String(task.taskId ?? task.id ?? "").trim();
  const status = taskCenterStatusMeta(task);
  const resultUrl = resolveTaskCenterResultUrl(task);
  const resultText = resolveTaskCenterResultText(task);
  const failure = taskCenterFailureMessage(task);
  const modelName = String(task.modelName ?? "").trim();
  return `
    <section class="task-center-detail" aria-label="任务详情">
      <header class="task-center-detail-header">
        <div><span>${escapeHtml(taskCenterKindLabel(task))}</span><h3>${escapeHtml(taskCenterTaskTitle(task))}</h3></div>
        <span class="task-center-status ${escapeAttr(status.tone)}"><i aria-hidden="true"></i>${escapeHtml(status.label)}</span>
      </header>
      <div class="task-center-id-line">
        <code title="${escapeAttr(taskId)}">${escapeHtml(taskId)}</code>
        <button class="task-center-icon-button" type="button" data-action="copy-task-center-id" data-task-id="${escapeAttr(taskId)}" aria-label="复制任务 ID" title="复制任务 ID">${renderTaskCenterUtilityIcon("copy")}</button>
      </div>
      <div class="task-center-result">
        <div class="task-center-section-label">生成内容</div>
        ${resultUrl ? taskCenterMediaKind(task) === "video"
          ? `<video src="${escapeAttr(resolveApiUrl(resultUrl))}" controls preload="metadata"></video>`
          : `<img src="${escapeAttr(resolveApiUrl(resultUrl))}" alt="任务生成结果" loading="lazy" />`
        : resultText
          ? `<pre>${escapeHtml(resultText)}</pre>`
          : `<div class="task-center-result-empty">${status.tone === "active" ? "正在生成" : "暂无生成内容"}</div>`}
      </div>
      ${failure ? `<div class="task-center-failure"><span class="task-center-section-label">${status.label === "待复核" ? "复核说明" : "失败原因"}</span><p>${escapeHtml(failure)}</p></div>` : ""}
      <dl class="task-center-metadata">
        ${renderTaskCenterMeta("项目", [task.projectName, task.episodeTitle].filter(Boolean).join(" / ") || "-")}
        ${renderTaskCenterMeta("模型", modelName || "-")}
        ${renderTaskCenterMeta("任务类型", taskCenterKindLabel(task))}
        ${renderTaskCenterMeta("提交时间", formatTaskCenterTime(task.submittedAt ?? task.createdAt))}
        ${renderTaskCenterMeta("开始时间", formatTaskCenterTime(task.startedAt))}
        ${renderTaskCenterMeta("返回时间", formatTaskCenterTime(task.returnedAt ?? task.completedAt ?? task.failedAt))}
        ${renderTaskCenterMeta("总耗时", formatTaskCenterDuration(task))}
      </dl>
    </section>
  `;
}

function renderTaskCenterMeta(label, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value ?? "-"))}</dd></div>`;
}

function renderTaskCenterLoadingRows() {
  return Array.from({ length: 6 }, () => `<div class="task-center-row task-center-row-skeleton"><span></span><span></span><span></span></div>`).join("");
}

function taskCenterStatusMeta(value) {
  const task = value && typeof value === "object" ? value : { status: value };
  const status = String(task.status ?? task.workflowStatus ?? "queued").trim().toLowerCase();
  const progressStage = String(
    task.progressStage ??
      task.progress_stage ??
      task.snapshot?.progressStage ??
      task.snapshot?.progress_stage ??
      "",
  ).trim().toLowerCase();
  const transferStatus = String(
    task.providerStatus?.transferStatus ??
      task.provider_status?.transferStatus ??
      task.failure?.transferStatus ??
      "",
  ).trim().toLowerCase();
  const failureCode = String(task.failureCode ?? task.failure?.failureCode ?? task.failure?.code ?? "").trim().toLowerCase();
  if (progressStage === "asset_transfer_retry_pending" || transferStatus === "retry_pending") {
    return { label: "存储超时，正在重试", tone: "active" };
  }
  if (failureCode === "provider_output_storage_failed" || progressStage === "asset_transfer_manual_review") {
    return { label: "存储失败，等待人工处理", tone: "failed" };
  }
  if (["completed", "succeeded", "success"].includes(status)) return { label: "已完成", tone: "completed" };
  if (["result_unknown", "manual_review_required"].includes(status)) return { label: "待复核", tone: "failed" };
  if (["failed", "canceled", "cancelled"].includes(status)) return { label: status.includes("cancel") ? "已取消" : "失败", tone: "failed" };
  if (status === "queued" || status === "pending" || status === "submitted") return { label: "排队中", tone: "queued" };
  return { label: "生成中", tone: "active" };
}

function taskCenterFailureMessage(task = {}) {
  const status = String(task.status ?? task.workflowStatus ?? "").trim().toLowerCase();
  const failureCode = String(task.failureCode ?? task.failure?.failureCode ?? task.failure?.code ?? "").trim();
  const progressStage = String(
    task.progressStage ??
      task.progress_stage ??
      task.snapshot?.progressStage ??
      task.snapshot?.progress_stage ??
      "",
  ).trim().toLowerCase();
  const transferStatus = String(
    task.providerStatus?.transferStatus ??
      task.provider_status?.transferStatus ??
      task.failure?.transferStatus ??
      "",
  ).trim().toLowerCase();
  if (progressStage === "asset_transfer_retry_pending" || transferStatus === "retry_pending") {
    return "存储超时，正在重试";
  }
  if (failureCode.toLowerCase() === "provider_output_storage_failed" || progressStage === "asset_transfer_manual_review") {
    return "存储失败，等待人工处理";
  }
  const mediaKind = taskCenterMediaKind(task);
  const timeoutHours = mediaKind === "video" ? 3 : 1;
  const creditStatus = String(task.creditStatus ?? task.credit?.status ?? task.snapshot?.creditStatus ?? "").toLowerCase();
  const creditsReleased = creditStatus === "released" || Number(task.credit?.released ?? 0) > 0;
  if (
    ["manual_review_required", "result_unknown"].includes(status) ||
    ["provider_submission_ambiguous", "provider_result_unknown", "provider_output_persist_failed", "worker_crashed_after_external_start"].includes(failureCode)
  ) {
    if (failureCode === "provider_output_persist_failed") {
      return "生成结果已保存到平台存储，但资产记录尚未写入，任务与积分状态等待后台复核。";
    }
    return "供应商结果暂不明确，任务与积分状态等待后台复核，请勿重复提交。";
  }
  if (failureCode === "task_timeout") {
    return `${mediaKind === "video" ? "视频" : "图片或音频"}生成超过 ${timeoutHours} 小时未完成，${creditsReleased ? "积分已返还" : "积分状态请以账本记录为准"}。`;
  }
  if (failureCode === "provider_poll_timeout" && !creditsReleased) {
    return `供应商处理超过 ${timeoutHours} 小时仍未确认结果，任务与积分状态等待后台复核。`;
  }
  return String(task.failure?.displayMessage ?? task.failure?.message ?? failureCode).trim();
}

function taskCenterMediaKind(task = {}) {
  return String(task.kind ?? task.mediaKind ?? "").trim().toLowerCase() === "video" ? "video" : "image";
}

function taskCenterKindLabel(task = {}) {
  const targetType = String(task.targetType ?? "").trim().toLowerCase();
  if (targetType === "team_asset") return "团队资产";
  if (targetType.includes("canvas")) return taskCenterMediaKind(task) === "video" ? "画布视频" : "画布图片";
  if (targetType.includes("storyboard")) return taskCenterMediaKind(task) === "video" ? "分镜视频" : "分镜图片";
  if (targetType.includes("asset")) return taskCenterMediaKind(task) === "video" ? "资产视频" : "资产图片";
  return taskCenterMediaKind(task) === "video" ? "视频生成" : "图片生成";
}

function taskCenterTaskTitle(task = {}) {
  return String(task.requestSummary?.selectedAssetName ?? task.episodeTitle ?? task.projectName ?? taskCenterKindLabel(task)).trim();
}

function resolveTaskCenterResultUrl(task = {}) {
  const asset = Array.isArray(task.resultAssets) ? task.resultAssets[0] : null;
  return String(
    task.result?.imageUrl ?? task.result?.videoUrl ?? task.result?.sourceUrl ?? task.result?.downloadUrl ??
    asset?.previewUrl ?? asset?.sourceUrl ?? asset?.downloadUrl ??
    task.fixedImages?.[0]?.url ?? task.fixedImages?.[0]?.src ?? task.fixedVideos?.[0]?.url ?? task.fixedVideos?.[0]?.src ?? "",
  ).trim();
}

function resolveTaskCenterResultText(task = {}) {
  return String(task.result?.text ?? task.result?.outputText ?? task.outputText ?? task.resultText ?? "").trim();
}

function formatTaskCenterTime(value, compact = false) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", compact
    ? { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }
    : { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

function formatTaskCenterDuration(task = {}) {
  const startedAt = Date.parse(task.startedAt ?? task.submittedAt ?? task.createdAt ?? "");
  const returnedAt = Date.parse(task.returnedAt ?? task.completedAt ?? task.failedAt ?? "");
  if (!Number.isFinite(startedAt)) return "-";
  const endAt = Number.isFinite(returnedAt) ? returnedAt : Date.now();
  const seconds = Math.max(0, Math.round((endAt - startedAt) / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分 ${seconds % 60} 秒`;
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`;
}

function renderTaskCenterUtilityIcon(icon) {
  const paths = {
    refresh: `<path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5" />`,
    copy: `<rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />`,
    close: `<path d="m6 6 12 12M18 6 6 18" />`,
  };
  return `<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">${paths[icon] ?? paths.close}</svg>`;
}

function renderGlobalPricingModal(ui = {}) {
  const pricingModal = renderPricingModal({
    open: ui.isLibraryPricingModalOpen === true,
    packages: ui.billingPackages ?? null,
    membershipPlans: ui.membershipPlans ?? null,
    membershipStatus: ui.membershipStatus ?? null,
    billingOrder: ui.lastBillingOrder ?? null,
    paymentIntent: ui.lastPaymentIntent ?? null,
    paymentAction: ui.lastPaymentAction ?? null,
    membershipPaymentState: resolveMembershipPaymentState(ui),
    pricingTab: ui.pricingModalTab ?? "membership",
    enterpriseContactOpen: ui.isEnterpriseContactModalOpen === true,
    enterpriseContactImageUrl: ui.customerSupportConfig?.enterpriseContactImageUrl
      ? resolveApiUrl(ui.customerSupportConfig.enterpriseContactImageUrl)
      : "",
  });
  if (!pricingModal) {
    return "";
  }
  return `
    <div class="library-team-page official-library-page library-team-global-pricing-scope" style="display: contents">
      ${pricingModal}
    </div>
  `;
}

function renderAnnouncementPanel(ui = {}) {
  if (!ui.announcementPanelOpen) {
    return "";
  }

  const announcements = Array.isArray(ui.announcements) ? ui.announcements : [];
  const loading = ui.announcementsLoading === true && ui.announcementsLoaded !== true;
  const error = String(ui.announcementError ?? "").trim();
  const body = loading
    ? `<div class="announcement-panel-state"><strong>正在加载公告</strong><span>请稍候</span></div>`
    : error
      ? `<div class="announcement-panel-state error"><strong>公告加载失败</strong><span>${escapeHtml(error)}</span></div>`
      : announcements.length
        ? `<div class="announcement-list">${announcements.map(renderAnnouncementItem).join("")}</div>`
        : `<div class="announcement-panel-state"><strong>暂无通知公告</strong></div>`;

  return `
    <div class="announcement-panel-backdrop" data-action="close-announcements" aria-hidden="true"></div>
    <aside class="announcement-panel-dialog" role="dialog" aria-modal="true" aria-labelledby="announcement-panel-title">
      <header class="announcement-panel-header">
        <div class="announcement-panel-heading">
          <span class="announcement-panel-icon" aria-hidden="true">${renderStatusbarActionIcon("bell")}</span>
          <div class="announcement-panel-title-stack">
            <h2 id="announcement-panel-title">通知公告</h2>
          </div>
        </div>
        <button class="announcement-panel-close" type="button" data-action="close-announcements" aria-label="关闭通知公告">
          <span class="announcement-panel-close-icon" aria-hidden="true"></span>
        </button>
      </header>
      <div class="announcement-panel-scroll">
        ${body}
      </div>
    </aside>
  `;
}

function renderAnnouncementItem(announcement = {}) {
  const title = String(announcement.title ?? "").trim();
  const body = String(announcement.body ?? "");
  const displayBody = splitAnnouncementBodyForDisplay(body);
  const hasBody = displayBody.content.trim().length > 0;
  return `
    <article class="announcement-item">
      <div class="announcement-item-head">
        <strong>${escapeHtml(title || "公告")}</strong>
      </div>
      ${hasBody ? `<p class="announcement-body">${escapeHtml(displayBody.content)}</p>` : ""}
      ${displayBody.signoff ? `<p class="announcement-signoff">${escapeHtml(displayBody.signoff)}</p>` : ""}
      ${renderAnnouncementAction(announcement)}
    </article>
  `;
}

function splitAnnouncementBodyForDisplay(body = "") {
  const lines = String(body ?? "").split(/\r?\n/);
  let lastContentIndex = lines.length - 1;
  while (lastContentIndex >= 0 && lines[lastContentIndex].trim() === "") {
    lastContentIndex -= 1;
  }
  if (lastContentIndex < 0) {
    return { content: "", signoff: "" };
  }

  const lastLine = lines[lastContentIndex] ?? "";
  const signoff = lastLine.trim();
  const isIndentedFinalLine = /^[\t \u3000]+/.test(lastLine);
  if (!isIndentedFinalLine || signoff.length > 40) {
    return { content: body, signoff: "" };
  }

  const contentLines = lines.slice(0, lastContentIndex);
  while (contentLines.length > 0 && contentLines[contentLines.length - 1].trim() === "") {
    contentLines.pop();
  }
  return {
    content: contentLines.join("\n"),
    signoff,
  };
}

function renderAnnouncementAction(announcement = {}) {
  const url = String(announcement.actionUrl ?? "").trim();
  const label = String(announcement.actionLabel ?? "").trim() || "查看详情";
  if (!url) {
    return "";
  }
  const external = /^https?:\/\//i.test(url);
  return `<a class="announcement-action-link" href="${escapeAttr(url)}" ${external ? `target="_blank" rel="noopener"` : ""}>${escapeHtml(label)}</a>`;
}

function renderCommunityWindowHeader(session = {}, options = {}) {
  const accountLabel = resolveStatusbarAccountLabel(session);
  const phoneLabel = String(session?.user?.phone ?? "").trim() || "未绑定手机号";
  const title = String(options.title ?? "灵曦社区").trim() || "灵曦社区";
  return `
    <header class="community-window-header" aria-label="${escapeAttr(title)}顶部栏">
      <div class="community-window-brand">
        <span class="statusbar-n-mark" aria-hidden="true">灵</span>
        <div>
          <strong>灵曦剧场</strong>
        </div>
      </div>
      <div class="community-window-title">${escapeHtml(title)}</div>
      <div class="community-window-actions">
        <div class="community-window-account">
          <button class="community-window-avatar" type="button" aria-haspopup="dialog" aria-label="查看当前登录用户">
            <span>${escapeHtml(resolveAccountSettingsAvatarLabel({ displayName: accountLabel }, session))}</span>
          </button>
          <div class="community-window-account-popover" role="dialog" aria-label="当前登录用户信息">
            <small>当前登录用户</small>
            <strong>${escapeHtml(accountLabel)}</strong>
            <span>${escapeHtml(phoneLabel)}</span>
          </div>
        </div>
        <button class="community-window-back" type="button" data-action="set-nav-tab" data-tab="home">返回工作台</button>
      </div>
    </header>
  `;
}

function renderPageBoundary(label, activeNavTab, renderContent) {
  try {
    return renderContent();
  } catch (error) {
    console.error(`[creator-app] page render failed: ${activeNavTab}`, error);
    return renderPageErrorPanel(label, error);
  }
}

function navTabLabel(activeNavTab) {
  return NAV_TABS.find((tab) => tab.id === activeNavTab)?.label ?? "当前页面";
}

function isCanvasNavTab(tab) {
  return tab === "tools" || tab === "new-canvas";
}

function renderPageErrorPanel(label, error) {
  const message = error instanceof Error ? error.message : String(error ?? "unknown_error");
  return `
    <section class="workbench-page-error" role="alert" aria-live="polite">
      <div>
        <p class="section-kicker">${escapeHtml(label)}</p>
        <h2>此页面暂时无法加载</h2>
        <p>${escapeHtml(message || "页面内部出现错误，请稍后重试。")}</p>
      </div>
      <div class="workbench-page-error-actions">
        <button class="secondary-action compact" type="button" data-action="navigate-home">返回首页</button>
        <button class="secondary-action compact" type="button" data-action="navigate-projects">查看项目</button>
      </div>
    </section>
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
  const pagination = normalizeCreditLedgerPagination(ui, rows.length);
  return `
    <div class="credit-ledger-backdrop" data-action="close-credit-ledger" aria-hidden="true"></div>
    <aside class="credit-ledger-drawer" role="dialog" aria-modal="true" aria-labelledby="credit-ledger-title">
      <header class="credit-ledger-header">
        <div class="credit-ledger-header-copy">
          <h2 id="credit-ledger-title">积分明细</h2>
          <p>每一次积分变动都会记录在这里。</p>
        </div>
        <div class="credit-ledger-header-actions">
          <button class="credit-ledger-close" type="button" data-action="close-credit-ledger" aria-label="关闭积分明细">×</button>
        </div>
      </header>
      <section class="credit-ledger-summary" aria-label="积分概览">
        ${renderCreditLedgerMetric("可用积分", summary.displayAvailableCredits ?? 0, "available")}
      </section>
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
                <th>时间</th>
                <th>账户</th>
                <th>类型</th>
                <th>内容</th>
                <th>更新后余额</th>
                <th>积分变化</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(renderCreditLedgerRow).join("")}
            </tbody>
          </table>
        ` : ""}
      </div>
      ${renderCreditLedgerPagination(pagination, loading)}
    </aside>
  `;
}

function normalizeCreditLedgerPagination(ui = {}, currentCount = 0) {
  const meta = ui.creditLedgerMeta && typeof ui.creditLedgerMeta === "object" ? ui.creditLedgerMeta : {};
  const pageSize = Math.max(1, Number(meta.pageSize ?? 10));
  const total = Math.max(0, Number(meta.total ?? currentCount));
  const reportedTotalPages = Math.max(1, Number(meta.totalPages ?? Math.ceil(total / pageSize) ?? 1));
  const requestedPage = Math.max(1, Number(meta.page ?? ui.creditLedgerPage ?? 1));
  const hasPossibleNextPage = currentCount >= pageSize;
  const totalPages = Math.max(reportedTotalPages, hasPossibleNextPage ? requestedPage + 1 : requestedPage);
  const page = Math.min(totalPages, requestedPage);
  return { page, pageSize, total, totalPages, hasPossibleNextPage };
}

function renderCreditLedgerPagination(pagination, loading = false) {
  const canPrev = pagination.page > 1 && !loading;
  const canNext = (pagination.page < pagination.totalPages || pagination.hasPossibleNextPage) && !loading;
  return `
    <footer class="credit-ledger-pagination" aria-label="积分明细分页">
      <span>共 ${escapeHtml(String(pagination.total))} 条</span>
      <div class="credit-ledger-page-actions">
        <button type="button" data-action="refresh-credit-ledger" ${loading ? "disabled" : ""}>刷新</button>
        <button type="button" data-action="change-credit-ledger-page" data-page="${escapeAttr(String(pagination.page - 1))}" ${canPrev ? "" : "disabled"}>上一页</button>
        <strong>${escapeHtml(String(pagination.page))} / ${escapeHtml(String(pagination.totalPages))}</strong>
        <button type="button" data-action="change-credit-ledger-page" data-page="${escapeAttr(String(pagination.page + 1))}" ${canNext ? "" : "disabled"}>下一页</button>
      </div>
    </footer>
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
      <td><time>${escapeHtml(formatLedgerDate(entry.createdAt))}</time></td>
      <td><span class="credit-ledger-account ${escapeAttr(entry.accountTone)}">${escapeHtml(entry.accountLabel)}</span></td>
      <td><span class="credit-ledger-type ${escapeAttr(entry.tone)}">${escapeHtml(entry.label)}</span></td>
      <td><span class="credit-ledger-content">${escapeHtml(entry.content)}</span></td>
      <td class="credit-ledger-balance">${escapeHtml(entry.displayBalanceAfter)}</td>
      <td class="${escapeAttr(entry.valueTone)}">${escapeHtml(entry.displayValue)}</td>
    </tr>
  `;
}

function normalizeCreditLedgerEntry(row = {}) {
  const type = String(row.entryType ?? "");
  const metadata = normalizeLedgerMetadata(row.metadata);
  const amount = Number(row.amount ?? 0);
  const availableDelta = Number(row.availableDelta ?? row.available_delta ?? 0);
  const balanceAfter = Number(row.balanceAfter ?? row.balance_after);
  const fallbackDelta = type === "consume" || type === "reservation" || type === "reserve"
    ? -Math.abs(amount)
    : amount;
  const signedDelta = Number.isFinite(availableDelta) && availableDelta !== 0 ? availableDelta : fallbackDelta;
  const creditType = normalizeCreditLedgerType(type, signedDelta);
  const displayAmount = creditType.displayAsAbsolute ? Math.abs(signedDelta || amount) : signedDelta;
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
  const failure = creditLedgerFailureLabel(failureCode, errorMessage, event);
  const result = creditLedgerResultLabel({ event, failure });
  const accountType = String(row.accountType ?? metadata.accountType ?? "").trim().toLowerCase();
  const accountLabel = resolveCreditLedgerAccountLabel(row, metadata);
  const sourceType = String(row.sourceType ?? row.source_type ?? "").trim().toLowerCase();
  const description = failure
    ? `失败：${failure}`
    : [eventLabel, model, content, duration ? `耗时 ${duration}` : ""].filter(Boolean).join(" · ") || "系统账本记录";
  const title = translateCreditLedgerReason(reason, metadata, sourceType) || [source, eventLabel].filter(Boolean).join(" · ") || creditType.label;
  const teamCreditType = normalizeTeamMemberCreditLedgerType(sourceType, creditType);
  return {
    label: teamCreditType.label,
    tone: teamCreditType.tone,
    valueTone: teamCreditType.valueTone,
    displayValue: creditType.displayAsAbsolute ? formatCreditNumber(displayAmount) : formatSignedCredit(displayAmount),
    displayBalanceAfter: Number.isFinite(balanceAfter) ? formatCreditNumber(balanceAfter) : "--",
    amount: signedDelta,
    availableDelta: signedDelta,
    createdAt: row.createdAt,
    taskId: task || String(row.sourceId ?? "").trim(),
    accountTone: accountType === "subaccount" ? "subaccount" : "owner",
    accountLabel,
    content: translateCreditLedgerContent(row, metadata, title),
    title,
    detail: description,
    result,
    source,
  };
}

function normalizeTeamMemberCreditLedgerType(sourceType, fallbackType) {
  if (sourceType === "team_member_credit_allocation") {
    return { ...fallbackType, label: "分配", tone: "grant" };
  }
  if (sourceType === "team_member_credit_deduction") {
    return { ...fallbackType, label: "收回", tone: "consume" };
  }
  return fallbackType;
}

function normalizeCreditLedgerType(type, signedDelta) {
  if (type === "consume") {
    return { label: "消耗", tone: "consume", valueTone: "negative", displayAsAbsolute: false };
  }
  if (type === "reservation" || type === "reserve") {
    if (signedDelta < 0) {
      return { label: "消耗", tone: "consume", valueTone: "negative", displayAsAbsolute: false };
    }
    return { label: "预占", tone: "reserve", valueTone: "reserve", displayAsAbsolute: false };
  }
  if (type === "release") {
    return { label: "返还", tone: "release", valueTone: "positive", displayAsAbsolute: false };
  }
  const isConsume = signedDelta < 0;
  return {
    label: isConsume ? "消耗" : "充值",
    tone: isConsume ? "consume" : "grant",
    valueTone: isConsume ? "negative" : "positive",
    displayAsAbsolute: false,
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
  const taskType = String(metadata.taskType ?? metadata.task_type ?? metadata.operation ?? "").trim().toLowerCase();
  if (targetType === "canvas") {
    if (mediaType === "video") {
      return "画布视频生成";
    }
    return "画布图片生成";
  }
  if (sourceType === "episode_generation_task") {
    if (mediaType === "text" || taskType.includes("script") || taskType.includes("storyboard_preview")) {
      return "剧本生成";
    }
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

function translateCreditLedgerReason(reason, metadata = {}, sourceType = "") {
  const normalized = String(reason ?? "").trim().toLowerCase();
  const normalizedSourceType = String(sourceType ?? "").trim().toLowerCase();
  const mediaType = String(metadata.mediaType ?? metadata.kind ?? "").trim().toLowerCase();
  const targetType = String(metadata.targetType ?? metadata.target_type ?? "").trim().toLowerCase();
  const taskType = String(metadata.taskType ?? metadata.task_type ?? metadata.operation ?? "").trim().toLowerCase();
  if (isCanvasAgentLedgerEntry(normalizedSourceType, normalized, metadata)) {
    return "画布协作Agent操作消耗";
  }
  if (!normalized) {
    return "";
  }
  if (normalized === "script generation") {
    return "剧本生成积分扣减";
  }
  if (normalized === "image generation") {
    return targetType === "canvas" ? "画布图片生成" : "图片生成";
  }
  if (normalized === "video generation") {
    return targetType === "canvas" ? "画布视频生成" : "视频生成";
  }
  if (normalized === "reservation allocation consumed" && (mediaType === "text" || taskType.includes("script") || taskType.includes("storyboard_preview"))) {
    return "剧本生成积分扣减";
  }
  if (normalized === "reservation allocation released") {
    return mediaType === "video" ? "视频生成积分返还" : "图片生成积分返还";
  }
  if (normalized === "reservation allocation consumed") {
    return mediaType === "video" ? "视频生成积分扣减" : "图片生成积分扣减";
  }
  if ((normalized.includes("reservation") || normalized.includes("reserve")) && (mediaType === "text" || taskType.includes("script") || taskType.includes("storyboard_preview"))) {
    return "剧本生成积分扣减";
  }
  if (normalized.includes("reservation") || normalized.includes("reserve")) {
    return mediaType === "video" ? "视频生成积分扣减" : "图片生成积分扣减";
  }
  return reason;
}

function translateCreditLedgerContent(row = {}, metadata = {}, fallback = "") {
  const sourceType = String(row.sourceType ?? row.source_type ?? "").trim().toLowerCase();
  const reason = String(row.reason ?? "").trim().toLowerCase();
  if (isCanvasAgentLedgerEntry(sourceType, reason, metadata)) {
    return "画布协作Agent操作消耗";
  }
  if (sourceType === "team_member_credit_allocation") {
    return "主账号分配积分";
  }
  if (sourceType === "team_member_credit_deduction") {
    return "主账号收回积分";
  }
  const taskType = String(metadata.taskType ?? metadata.task_type ?? metadata.operation ?? "").trim().toLowerCase();
  if (
    sourceType === "team_member_generation_task" ||
    (sourceType === "episode_generation_task" && (taskType.includes("storyboard_preview") || taskType.includes("ai_storyboard")))
  ) {
    return "AI分镜积分消耗";
  }
  if (sourceType === "team_member_generation_refund") {
    return "AI分镜失败返还";
  }
  const explicit = String(row.content ?? metadata.content ?? "").trim();
  if (explicit) {
    return explicit;
  }
  return fallback || "积分变动";
}

function isCanvasAgentLedgerEntry(sourceType, reason, metadata = {}) {
  return sourceType === "canvas_agent_text_round"
    || (sourceType === "credit_reservation_allocation" && Boolean(metadata.agentStepId ?? metadata.agent_step_id))
    || reason === "canvas agent text round"
    || reason === "canvas agent text round unused reservation"
    || reason === "canvas agent text round interrupted before provider start"
    || reason === "画布协作agent操作消耗";
}

function resolveCreditLedgerAccountLabel(row = {}, metadata = {}) {
  const explicit = String(row.accountLabel ?? metadata.accountLabel ?? "").trim();
  if (explicit) {
    return explicit;
  }
  const accountType = String(row.accountType ?? metadata.accountType ?? "").trim().toLowerCase();
  return accountType === "subaccount" ? "子账户" : "主账户";
}

function creditLedgerFailureLabel(code, message, billingEvent = "") {
  const normalizedCode = String(code ?? "").trim();
  const normalizedMessage = String(message ?? "").trim();
  const normalizedEvent = String(billingEvent ?? "").trim().toLowerCase();
  const creditSuffix = normalizedEvent === "released"
    ? "，积分已返还"
    : normalizedEvent === "manual_review_required"
      ? "，积分状态待复核"
      : "，积分状态以账本记录为准";
  const labels = {
    task_timeout: `任务超时${creditSuffix}`,
    provider_poll_timeout: `模型处理超时${creditSuffix}`,
    provider_failed: `模型处理失败${creditSuffix}`,
    provider_submission_prepare_failed: `发送模型前准备失败${creditSuffix}`,
    provider_submission_failed: `发送模型失败${creditSuffix}`,
    provider_submission_ambiguous: `模型接收状态不明确${creditSuffix}`,
    provider_output_download_failed: "存储超时，正在重试",
    provider_output_upload_failed: "存储超时，正在重试",
    provider_output_persist_failed: `结果入库失败${creditSuffix}`,
    provider_result_unknown: `模型结果状态未知${creditSuffix}`,
    worker_crashed_after_external_start: `后台处理意外中断${creditSuffix}`,
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

function formatBytes(value) {
  const bytes = Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let index = 0;
  let current = bytes;
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }
  const digits = current >= 10 || index === 0 ? 0 : 1;
  return `${current.toFixed(digits)} ${units[index]}`;
}

function renderAccountSettingsDrawer(ui = {}, session = {}) {
  if (!ui.accountSettingsOpen) {
    return "";
  }

  const form = normalizeAccountSettingsForm(ui.accountSettingsForm, session, ui.membershipStatus ?? null);
  const isTeamMember = form.isTeamMember;
  const passwordExpanded = ui.accountSettingsPasswordExpanded !== false;
  const saving = ui.busy && ui.accountSettingsOpen;

  return `
    <div class="account-settings-backdrop" data-action="close-account-settings" aria-hidden="true"></div>
    <aside class="account-settings-drawer" role="dialog" aria-modal="true" aria-labelledby="account-settings-title">
      <header class="account-settings-header">
        <div>
          <p class="account-settings-kicker">Account Console</p>
          <h2 id="account-settings-title">账号设置</h2>
          <p class="account-settings-subtitle">${isTeamMember ? "管理你自己的账户信息与登录密码。" : "管理你的公开信息、登录安全与消息偏好。"}</p>
        </div>
        <button class="account-settings-close" type="button" data-action="close-account-settings" aria-label="关闭账号设置">×</button>
      </header>

      <section class="account-settings-hero">
        <div class="account-settings-avatar" aria-hidden="true">${escapeHtml(resolveAccountSettingsAvatarLabel(form, session))}</div>
        <div class="account-settings-hero-copy">
          <strong>${escapeHtml(form.displayName || "未命名创作者")}</strong>
          <span>${escapeHtml(isTeamMember ? form.loginAccount : (form.phone || "未绑定手机号"))}</span>
          ${isTeamMember ? "" : `<span>${escapeHtml(form.planLabel)}</span>`}
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
              maxlength="${ACCOUNT_DISPLAY_NAME_MAX_LENGTH}"
              placeholder="请输入显示昵称"
              data-action="change-account-settings-field"
              data-field="displayName"
            />
          </label>
          <label class="account-settings-field readonly">
            <span>${isTeamMember ? "登录账户" : "绑定手机号"}</span>
            <div class="account-settings-static-field">
              <input type="text" value="${escapeAttr(isTeamMember ? form.loginAccount : form.phone)}" readonly />
              ${isTeamMember ? "" : `<button type="button" data-action="account-settings-placeholder" data-message="手机号更换功能将在后续版本开放。">更换</button>`}
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
        <div class="account-settings-footer-actions">
          <button type="button" class="ghost" data-action="close-account-settings">取消</button>
          <button type="button" class="primary" data-action="submit-account-settings" ${saving ? "disabled" : ""}>保存更改</button>
        </div>
      </footer>
    </aside>
  `;
}

function normalizeAccountSettingsForm(form = {}, session = {}, membershipStatus = null) {
  const user = session?.user ?? {};
  const teamMember = user.teamMember ?? null;
  const notifications = form.notifications ?? {};
  return {
    displayName: String(form.displayName ?? teamMember?.memberName ?? user.displayName ?? ""),
    phone: String(form.phone ?? user.phone ?? ""),
    email: String(form.email ?? user.email ?? ""),
    loginAccount: String(teamMember?.memberLoginAccount ?? ""),
    isTeamMember: Boolean(teamMember || user.actorType === "team_member"),
    currentPassword: String(form.currentPassword ?? ""),
    newPassword: String(form.newPassword ?? ""),
    confirmPassword: String(form.confirmPassword ?? ""),
    notifications: {
      projectUpdates: notifications.projectUpdates !== false,
      renderComplete: notifications.renderComplete !== false,
      marketing: notifications.marketing === true,
    },
    planLabel: resolveMembershipPlanLabel(membershipStatus),
  };
}

function renderInviteGiftDrawer(ui = {}) {
  if (!ui.inviteGiftOpen) {
    return "";
  }
  const inviteSummary = normalizeInviteSummary(ui.accountInviteSummary);
  return `
    <div class="account-settings-backdrop" data-action="close-invite-gift" aria-hidden="true"></div>
    <aside class="account-settings-drawer invite-gift-drawer" role="dialog" aria-modal="true" aria-labelledby="invite-gift-title">
      <header class="account-settings-header">
        <div>
          <p class="account-settings-kicker">Invite</p>
          <h2 id="invite-gift-title">邀请有礼</h2>
        </div>
        <button class="account-settings-close" type="button" data-action="close-invite-gift" aria-label="关闭邀请有礼">×</button>
      </header>
      <div class="account-settings-scroll invite-gift-scroll">
        ${renderAccountInviteCard(inviteSummary)}
      </div>
    </aside>
  `;
}

function normalizeInviteSummary(summary = null) {
  if (!summary || typeof summary !== "object") {
    return {
      loading: false,
      loaded: false,
      error: "",
      inviteCode: "",
      inviteLink: "",
      invitedCount: 0,
      rewardedInvitedCount: 0,
      totalRewardCredits: 0,
      rebateCredits: 0,
      details: [],
    };
  }
  return {
    loading: summary.loading === true,
    loaded: summary.loaded === true,
    error: String(summary.error ?? "").trim(),
    inviteCode: String(summary.inviteCode ?? "").trim(),
    inviteLink: String(summary.inviteLink ?? "").trim(),
    invitedCount: Number(summary.invitedCount ?? 0),
    rewardedInvitedCount: Number(summary.rewardedInvitedCount ?? 0),
    totalRewardCredits: Number(summary.totalRewardCredits ?? 0),
    rebateCredits: Number(summary.rebateCredits ?? 0),
    details: Array.isArray(summary.details) ? summary.details : [],
  };
}

function renderAccountInviteCard(summary) {
  const statusCopy = summary.error
    ? "邀请数据暂时不可用"
    : summary.loading
      ? "正在同步邀请数据"
      : "新用户通过链接注册后自动生效";
  const inviteCode = summary.inviteCode || "生成中";
  const inviteLink = summary.inviteLink || "";
  return `
    <section class="account-settings-card account-invite-card">
      <div class="account-invite-link-box">
        <div>
          <span>专属邀请码</span>
          <strong>${escapeHtml(inviteCode)}</strong>
        </div>
        <button type="button" data-action="copy-account-invite-link" ${inviteLink ? "" : "disabled"}>复制链接</button>
      </div>
      <div class="account-invite-url" title="${escapeAttr(inviteLink || statusCopy)}">
        ${escapeHtml(inviteLink || statusCopy)}
      </div>
      <div class="account-invite-metrics" aria-label="邀请统计">
        <div>
          <span>已邀请</span>
          <strong>${formatAccountInviteInteger(summary.invitedCount)}</strong>
        </div>
        <div>
          <span>已生效</span>
          <strong>${formatAccountInviteInteger(summary.rewardedInvitedCount)}</strong>
        </div>
        <div>
          <span>奖励积分</span>
          <strong>${formatAccountInviteInteger(summary.totalRewardCredits)}</strong>
        </div>
        <div>
          <span>充值返利</span>
          <strong>${formatAccountInviteInteger(summary.rebateCredits)}</strong>
        </div>
      </div>
      ${renderAccountInviteDetails(summary)}
    </section>
  `;
}

function renderAccountInviteDetails(summary) {
  if (summary.error) {
    return `<p class="account-invite-empty">${escapeHtml(summary.error)}</p>`;
  }
  if (summary.loading && !summary.loaded) {
    return `<p class="account-invite-empty">正在加载邀请明细...</p>`;
  }
  if (!summary.details.length) {
    return `<p class="account-invite-empty">还没有邀请记录。</p>`;
  }
  return `
    <div class="account-invite-table-wrap">
      <table class="account-invite-table">
        <thead>
          <tr>
            <th>用户</th>
            <th>注册时间</th>
            <th>状态</th>
            <th>返利</th>
          </tr>
        </thead>
        <tbody>
          ${summary.details.map(renderAccountInviteDetailRow).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderAccountInviteDetailRow(detail = {}) {
  const label = String(detail.invitedUserLabel ?? detail.maskedPhone ?? "新用户").trim() || "新用户";
  const status = detail.newUserRewardStatus === "granted" || detail.inviterRewardStatus === "granted"
    ? "已生效"
    : detail.status === "active"
      ? "已绑定"
      : "未生效";
  const rebate = Number(detail.rebateCredits ?? 0);
  return `
    <tr>
      <td>${escapeHtml(label)}</td>
      <td>${escapeHtml(formatAccountInviteDate(detail.boundAt))}</td>
      <td><span class="account-invite-status">${escapeHtml(status)}</span></td>
      <td>${rebate > 0 ? `+${formatAccountInviteInteger(rebate)}` : "-"}</td>
    </tr>
  `;
}

function formatAccountInviteInteger(value) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) {
    return "0";
  }
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(Math.round(number));
}

function formatAccountInviteDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function resolveAccountSettingsAvatarLabel(form, session = {}) {
  const preferred = String(form.displayName || session?.user?.displayName || session?.user?.phone || "我").trim();
  return [...preferred].slice(0, 2).join("");
}

function resolveStatusbarAccountLabel(session = {}) {
  const teamMember = session?.user?.teamMember ?? null;
  const displayName = String(teamMember?.memberName ?? session?.user?.displayName ?? "").trim();
  if (displayName) {
    return displayName;
  }
  const loginAccount = String(teamMember?.memberLoginAccount ?? "").trim();
  if (loginAccount) {
    return loginAccount;
  }
  const phone = String(session?.user?.phone ?? "").trim();
  const phoneTail = phone.slice(-8);
  return `创作者 ${phoneTail || "442027442"}`;
}

function formatMembershipDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

function resolveMembershipPlanLabel(membershipStatus = null) {
  const status = String(membershipStatus?.status ?? membershipStatus?.membership?.status ?? "").trim();
  const endAt =
    membershipStatus?.currentPeriodEndAt ??
    membershipStatus?.membership?.currentPeriodEndAt ??
    null;
  const dateLabel = formatMembershipDate(endAt);
  if (status === "professional_active") {
    return `当前套餐：专业版${dateLabel ? `（${dateLabel} 到期）` : ""}`;
  }
  if (status === "experience_active") {
    return `当前套餐：体验版${dateLabel ? `（${dateLabel} 到期）` : ""}`;
  }
  return "当前套餐：未开通";
}

function resolveStatusbarAccountCard(session = {}, membershipStatus = null) {
  const user = session.user ?? {};
  const teamMember = user.teamMember ?? null;
  const displayName = String(teamMember?.memberName ?? user.displayName ?? user.nickname ?? "").trim();
  const loginAccount = String(teamMember?.memberLoginAccount ?? "").trim();
  const phone = String(user.phone ?? user.phoneE164 ?? "").trim();
  const primaryText = displayName || loginAccount || phone || "未命名创作者";
  const status = String(membershipStatus?.status ?? membershipStatus?.membership?.status ?? "");
  const periodEndAt =
    membershipStatus?.currentPeriodEndAt ??
    membershipStatus?.membership?.currentPeriodEndAt ??
    null;
  const dateLabel = formatMembershipDate(periodEndAt);
  const membershipLabel =
    status === "professional_active"
      ? `当前套餐：专业版${dateLabel ? `（${dateLabel} 到期）` : ""}`
      : status === "experience_active"
        ? `当前套餐：体验版${dateLabel ? `（${dateLabel} 到期）` : ""}`
        : "当前套餐：未开通";

  if (loginAccount) {
    return {
      primaryText,
      secondaryText: `${loginAccount} · ${membershipLabel}`,
    };
  }
  return {
    primaryText,
    secondaryText: membershipLabel,
  };
}

function renderStatusToast(message, extraClassName = "", options = {}) {
  const toasts = (Array.isArray(message) ? message : [message])
    .map((item) => normalizeStatusToast(item))
    .filter((toast) => toast.message);
  if (!toasts.length) {
    return "";
  }
  const items = toasts.map((toast) => {
    const tone = toast.tone || resolveStatusToastTone(toast.message);
    const persistent = toast.persistent === true || (toast.persistent !== false && options.persistent === true);
    const title = persistent ? "处理中" : tone === "error" ? "操作失败" : tone === "warning" ? "提示" : "操作成功";
    const className = [
      "workbench-toast",
      "global-workbench-toast",
      tone,
      persistent ? "is-persistent" : "",
      extraClassName,
    ].filter(Boolean).join(" ");
    return `
      <div class="${className}" data-toast-id="${escapeAttr(toast.id)}" role="status">
        <strong>${title}</strong>
        <span>${escapeHtml(toast.message)}</span>
      </div>
    `;
  }).join("");
  const stackClassName = ["global-workbench-toast-stack", extraClassName].filter(Boolean).join(" ");
  return `
    <div id="app-status" class="${stackClassName}" aria-live="polite" aria-atomic="false">
      ${items}
    </div>
  `;
}

function renderInlineStatusToast(ui = {}, extraClassName = "") {
  if (ui.accountSettingsOpen || ui.inviteGiftOpen || ui.assetGeneratorModal) {
    return "";
  }
  const toasts = Array.isArray(ui.toastQueue) ? ui.toastQueue : ui.toast;
  return renderStatusToast(toasts, extraClassName, { persistent: ui.busy === true });
}

function renderOverlayStatusToast(ui = {}) {
  const toasts = Array.isArray(ui.toastQueue) ? ui.toastQueue : ui.toast;
  const latestToast = normalizeStatusToast(Array.isArray(toasts) ? toasts.at(-1) : toasts);
  if (!ui.accountSettingsOpen && !ui.inviteGiftOpen && !ui.assetGeneratorModal && !shouldRenderPaymentResultOverlayToast(ui, latestToast)) {
    return "";
  }
  const extraClassName = ui.accountSettingsOpen || ui.inviteGiftOpen
    ? "account-settings-toast"
    : ui.assetGeneratorModal
      ? "asset-generator-toast"
      : "";
  return renderStatusToast(toasts, extraClassName, { persistent: ui.busy === true });
}

function normalizeStatusToast(message) {
  if (message && typeof message === "object" && !Array.isArray(message)) {
    const normalizedMessage = String(message.message ?? message.text ?? "").trim();
    const tone = String(message.tone ?? "").trim().toLowerCase();
    return {
      id: String(message.id ?? "").trim(),
      message: normalizedMessage,
      tone: tone === "error" || tone === "success" || tone === "warning" ? tone : "",
      persistent: message.persistent === true ? true : message.persistent === false ? false : undefined,
    };
  }
  return { id: "", message: String(message ?? "").trim(), tone: "", persistent: undefined };
}

function isPaymentResultToast(message) {
  const toast = normalizeStatusToast(message);
  return [
    "会员权益已开通",
    "积分已到账",
  ].includes(toast.message);
}

function shouldRenderPaymentResultOverlayToast(ui = {}, message) {
  return (
    isCanvasNavTab(ui.activeNavTab) &&
    isPaymentResultToast(message)
  );
}

function resolveStatusToastTone(message) {
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
    ui.creditLedgerSummary?.displayCreditBalance,
    ui.creditLedgerSummary?.displayAvailableCredits,
    session?.user?.availableCredits,
    session?.user?.creditBalance,
    session?.user?.credits,
    session?.availableCredits,
    session?.creditBalance,
    ui.displayCreditBalance,
    session?.user?.displayCreditBalance,
    session?.displayCreditBalance,
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

function resolveMembershipPaymentState(ui) {
  return {
    pendingMembershipPlanId: ui.pendingMembershipPlanId ?? "",
    pendingBillingPackageId: ui.pendingBillingPackageId ?? "",
    provider: ui.pendingMembershipPaymentProvider ?? ui.lastPaymentIntent?.provider ?? "wechat_pay",
    qrCreatedAt: ui.membershipPaymentQrCreatedAt ?? null,
    qrExpiresAt: ui.membershipPaymentQrExpiresAt ?? ui.lastPaymentIntent?.expiresAt ?? null,
    polling: Boolean(ui.membershipPaymentPolling),
    creating: Boolean(ui.membershipPaymentCreating),
    syncing: Boolean(ui.membershipPaymentSyncing),
    pollFailureCount: Number(ui.membershipPaymentPollFailureCount ?? 0),
    agreementAccepted: ui.membershipPaymentAgreementAccepted !== false,
  };
}

export function renderWorkbenchRail(activeNavTab, session = {}, ui = {}) {
  const isTeamMember = isTeamMemberSession(session);
  const isAnonymous = !hasActiveSessionUser(session);
  const railTabs = NAV_TABS.filter((tab) =>
    (!isTeamMember || tab.id !== "team") &&
      (isNewCanvasEnabled(session) || tab.id !== "new-canvas"),
  );
  return `
    <aside class="workbench-rail persistent" aria-label="工作台导航">
      <nav class="rail-nav" role="tablist" aria-label="主导航">
        ${railTabs.map((tab) => renderRailTab(tab, activeNavTab)).join("")}
      </nav>
      <button class="rail-item rail-bottom" type="button" data-action="logout">${isAnonymous ? "登录" : "退出"}</button>
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
  const episodeWorkbenchAssetLibrary = resolveEpisodeWorkbenchAssetLibrary(ui, state);

  return `
    <section class="episode-workbench-screen" aria-label="episode-workbench">
      ${renderEpisodeWorkbench({
        session,
        episodeId: activeEpisode?.id ?? "",
        episodeTitle: activeEpisode?.title ?? "",
        storyboards: activeStoryboards,
        storyboardPagination: getEpisodePreviewStoryboardPagination(activeStoryboardEpisodeId, ui),
        selectedStoryboard,
        assetLibrary: episodeWorkbenchAssetLibrary,
        activeAssetTab: ui.projectAssetTab ?? "character",
        selectedEpisodeCardId: ui.selectedEpisodeCardId ?? null,
        selectedEpisodeAssetId: ui.selectedEpisodeAssetId ?? null,
        selectedEpisodeAssetIds: ui.selectedEpisodeAssetIds ?? [],
        selectedStoryboardIds: ui.selectedStoryboardIds ?? [],
        storyboardPage: ui.storyboardPage ?? 1,
        storyboardPageSize: ui.storyboardPageSize ?? 10,
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
         assetImageStyleSkillModal: "",
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
          projectStyles: ui.projectStyles ?? [],
          projectStyleCode: resolveEpisodeProjectStyleCode(state, ui),
          selectedProjectStyleCode: resolveSelectedEpisodeProjectStyleCode(state, ui),
          assetImageStyleSkillId: resolveSelectedAssetImageStyleSkillId(state, ui),
          assetImageStyleSkillModalOpen: Boolean(ui.assetImageStyleSkillModalOpen),
          assetImageStyleOfficialSkills: ui.episodeBatchOfficialImageStyleSkills ?? [],
          assetImageStylePrivateSkills: ui.episodeBatchPrivateImageStyleSkills ?? [],
        },
        storyboardDeleteTarget: ui.storyboardDeleteId ?? null,
        storyboardImageDeleteTarget: ui.storyboardImageDeleteTarget ?? null,
        storyboardVideoDeleteTarget: ui.storyboardVideoDeleteTarget ?? null,
        generationResultDeleteTarget: ui.generationResultDeleteTarget ?? null,
        episodeAssetCreateModal: ui.episodeAssetCreateModal ?? null,
        assetInspector: ui.assetInspector ?? null,
        episodeWorkbenchAttachments: ui.episodeWorkbenchAttachments ?? [],
        episodeVoiceModal: ui.episodeVoiceModal ?? null,
        episodeVoiceTeamAssets: ui.episodeVoiceTeamAssets ?? [],
        episodeVoiceTeamLoading: Boolean(ui.episodeVoiceTeamLoading),
        episodeVoiceTeamError: ui.episodeVoiceTeamError ?? "",
        generationPollingActive: Boolean(ui.generationPollingActive),
        imageGenerationResult: ui.imageGenerationResult ?? null,
        videoGenerationResult: ui.videoGenerationResult ?? null,
        assetSearchQuery: ui.assetSearchQuery ?? "",
        isQuickAssetRailCollapsed: Boolean(ui.episodeQuickAssetRailCollapsed),
        exportPreviewResult: ui.exportPreviewResult ?? null,
        exportOptionModal: ui.exportOptionModal ?? null,
        episodeBatchModal: ui.episodeBatchModal ?? null,
        assetImportModal: ui.assetImportModal ?? null,
        assetImportModalTab: ui.assetImportModalTab ?? "local",
        assetImportModalSource: ui.assetImportModalSource ?? null,
        episodeAssetLibraryModal: ui.episodeAssetLibraryModal ?? null,
        episodeAssetLibraryCategory: ui.episodeAssetLibraryCategory ?? ui.projectAssetTab ?? "character",
        episodeAssetLibraryFolder: ui.episodeAssetLibraryFolder ?? "",
        episodeAssetLibraryQuery: ui.episodeAssetLibraryQuery ?? "",
        assetImportCategory: ui.assetImportCategory ?? "domestic-modern-city",
        assetImportDrafts: ui.assetImportDrafts ?? [],
        assetImportSelection: ui.assetImportSelection ?? [],
        membershipStatus: ui.membershipStatus ?? null,
        teamAssetLibraryEnabled: hasTeamAssetLibraryAccess(ui),
        assetImportPage: ui.assetImportPage ?? 1,
        assetImportPageSize: ui.assetImportPageSize ?? 10,
        assetImportPageSizeMenuOpen: Boolean(ui.assetImportPageSizeMenuOpen),
       assetImportOfficialAssets: ui.assetImportOfficialAssets ?? null,
        projectLibraryAssetsByType: ui.projectLibraryAssetsByType ?? null,
        projectOtherAssetMediaType: normalizeProjectOtherAssetMediaType(ui.projectOtherAssetMediaType, "audio"),
        projectDetail: ui.projectDetail ?? null,
      })}
      ${renderInlineStatusToast(ui, "interior-toast")}
    </section>
  `;
}

function resolveEpisodeWorkbenchAssetLibrary(ui, state = {}) {
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
    const contextCharacterAssets = mapEpisodeWorkbenchContextAssets(
      resolveEpisodeWorkbenchAssetEntries(contextAssets, "character"),
      "character",
    );
    const contextSceneAssets = mapEpisodeWorkbenchContextAssets(
      resolveEpisodeWorkbenchAssetEntries(contextAssets, "scene"),
      "scene",
    );
    const contextPropAssets = mapEpisodeWorkbenchContextAssets(
      resolveEpisodeWorkbenchAssetEntries(contextAssets, "prop"),
      "prop",
    );
    return hydrateEpisodeAssetLibraryFromProjectLibraryByName({
      ui,
      state,
      character: contextCharacterAssets.length
        ? contextCharacterAssets
        : applyConversationPreviewFallback(importedAssets.character ?? [], ui.assetConversationHistory ?? {}),
      scene: contextSceneAssets.length
        ? contextSceneAssets
        : applyConversationPreviewFallback(importedAssets.scene ?? [], ui.assetConversationHistory ?? {}),
      prop: contextPropAssets.length
        ? contextPropAssets
        : applyConversationPreviewFallback(importedAssets.prop ?? [], ui.assetConversationHistory ?? {}),
    });
  }

  return hydrateEpisodeAssetLibraryFromProjectLibraryByName({
    ui,
    state,
    character: applyConversationPreviewFallback(importedAssets.character ?? [], ui.assetConversationHistory ?? {}),
    scene: applyConversationPreviewFallback(importedAssets.scene ?? [], ui.assetConversationHistory ?? {}),
    prop: applyConversationPreviewFallback(importedAssets.prop ?? [], ui.assetConversationHistory ?? {}),
  });
}

function applyConversationPreviewFallback(assets = [], historyMap = {}) {
  return filterTemporaryEpisodeUploadAssets(assets);
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
  return filterTemporaryEpisodeUploadAssets(assets).map((asset) => ({
    id: asset?.assetId ?? asset?.id ?? "",
    assetId: asset?.assetId ?? asset?.id ?? null,
    name: asset?.name ?? asset?.label ?? "未命名资产",
    preview: resolveEpisodeAssetPreviewUrl(asset),
    previewUrl: resolveEpisodeAssetPreviewUrl(asset),
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
    fixedImageUrl: resolveEpisodeAssetPreviewUrl(asset),
    fixedImageStorageObjectId: asset?.fixedImageStorageObjectId ?? null,
  }));
}

function hydrateEpisodeAssetLibraryFromProjectLibraryByName({ ui = {}, state = {}, character = [], scene = [], prop = [] } = {}) {
  return {
    character: hydrateEpisodeAssetsFromProjectLibraryByName(ui, state, character, "character"),
    scene: hydrateEpisodeAssetsFromProjectLibraryByName(ui, state, scene, "scene"),
    prop: hydrateEpisodeAssetsFromProjectLibraryByName(ui, state, prop, "prop"),
  };
}

function hydrateEpisodeAssetsFromProjectLibraryByName(ui = {}, state = {}, assets = [], kind = "character") {
  const previewByName = buildProjectAssetPreviewMapByName(ui, state, kind);
  if (!previewByName.size) {
    return Array.isArray(assets) ? assets : [];
  }
  return (Array.isArray(assets) ? assets : []).map((asset) => {
    const currentPreview = resolveEpisodeAssetPreviewUrl(asset);
    if (currentPreview && !isMockPreviewUrl(currentPreview)) {
      return asset;
    }
    const matchedPreview = findProjectAssetPreviewForEpisodeAsset(previewByName, asset);
    if (!matchedPreview) {
      return asset;
    }
    return {
      ...asset,
      preview: matchedPreview,
      previewUrl: matchedPreview,
      fixedImageUrl: matchedPreview,
      sourceUrl: asset?.sourceUrl ?? matchedPreview,
    };
  });
}

function buildProjectAssetPreviewMapByName(ui = {}, state = {}, kind = "character") {
  const previewByName = new Map();
  const projectAssets = [
    ...(Array.isArray(ui.projectLibraryAssetsByType?.[kind]) ? ui.projectLibraryAssetsByType[kind] : []),
    ...(Array.isArray(ui.projectDetail?.assetsByType?.[kind]) ? ui.projectDetail.assetsByType[kind] : []),
    ...(Array.isArray(state.projectDetail?.assetsByType?.[kind]) ? state.projectDetail.assetsByType[kind] : []),
  ];
  for (const asset of projectAssets) {
    const preview = resolveEpisodeAssetPreviewUrl(asset);
    if (!preview || isMockPreviewUrl(preview)) {
      continue;
    }
    for (const name of listProjectAssetMatchNames(asset)) {
      const normalizedName = normalizeEpisodeAssetNameForMatch(name);
      if (normalizedName && !previewByName.has(normalizedName)) {
        previewByName.set(normalizedName, preview);
      }
    }
  }
  return previewByName;
}

function findProjectAssetPreviewForEpisodeAsset(previewByName, asset) {
  for (const name of listProjectAssetMatchNames(asset)) {
    const normalizedName = normalizeEpisodeAssetNameForMatch(name);
    if (normalizedName && previewByName.has(normalizedName)) {
      return previewByName.get(normalizedName);
    }
  }
  return "";
}

function listProjectAssetMatchNames(asset) {
  return [
    asset?.name,
    asset?.label,
    asset?.assetKey,
    extractAssetDisplayNameFromKey(asset?.assetKey),
  ].filter(Boolean);
}

function extractAssetDisplayNameFromKey(value) {
  const raw = String(value ?? "").trim();
  const match = /^(?:character|role|scene|prop|asset)[-_](.+?)(?:[-_][a-f0-9]{6,}|[-_]\d{6,})?$/i.exec(raw);
  return match?.[1]?.trim() ?? "";
}

function normalizeEpisodeAssetNameForMatch(value) {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .replace(/^[@#]+/, "")
    .toLowerCase();
}

function resolveEpisodeAssetPreviewUrl(asset) {
  return resolvePreferredPreviewUrl(
    asset?.fixedImageUrl,
    asset?.preview,
    asset?.previewUrl,
    asset?.publicUrl,
    asset?.coverImageUrl,
    asset?.src,
    asset?.imageUrl,
    asset?.url,
    asset?.sourceUrl,
    asset?.latestVersion?.previewUrl,
    asset?.latestVersion?.metadata?.fixedImageUrl,
    asset?.latestVersion?.metadata?.previewUrl,
  );
}

function renderProjectInteriorShell({ state, ui, detailState }) {
  const aspectRatio = detailState.project.aspectRatio || "16:9";
  const hasAssets = Boolean(state.assetCandidates);
  const episodeCount = detailState.episodes?.length ?? 0;
  const activeInteriorSection = normalizeProjectInteriorSection(ui.projectInteriorSection);
  const activeAssetTab = ui.projectAssetTab ?? "character";

  return `
    <section class="project-interior" aria-label="项目内部工作台">
      ${renderProjectWorkbenchNav(activeInteriorSection, detailState)}

      <main class="project-interior-main ${activeInteriorSection === "assets" ? "asset-library-mode" : ""}">
        ${
          activeInteriorSection === "assets"
            ? renderProjectAssetLibrary({ state, ui, activeAssetTab })
            : activeInteriorSection === "episodes"
              ? renderProjectEpisodesInterior({ state, ui })
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
        ${renderInlineStatusToast(ui, "interior-toast")}
      </main>
      ${ui.assetGeneratorModal ? renderAssetGeneratorModal(ui) : ""}
      ${ui.assetGeneratorUploading ? renderAssetGeneratorUploadModal() : ""}
      ${ui.assetImportModal ? renderAssetImportModal(ui) : ""}
      ${ui.isSingleEpisodeModalOpen ? renderSingleEpisodeModal(ui, state) : ""}
      ${renderEpisodeRenameModal(ui)}
      ${renderEpisodeDeleteModal(ui)}
      ${renderImportedAssetRenameModal(ui)}
      ${renderImportedAssetDeleteModal(ui)}
      ${renderAssetImageStyleSkillModal(ui, state)}
    </section>
  `;
}

function renderProjectEpisodesInterior({ state, ui }) {
  const episodes = getEpisodeHubEntries(state, ui);
  return renderEpisodeHub({ episodes, ui });
}

function renderProjectStatsInterior(ui) {
  const stats = normalizeProjectStats(ui.projectStats);
  const outputCount = stats.generatedImageCount + stats.generatedVideoCount;
  const imageCoverage = calculateProjectStatPercentage(stats.generatedImageCount, stats.shotCount);
  const videoCoverage = calculateProjectStatPercentage(stats.generatedVideoCount, stats.shotCount);
  const shotsPerEpisode = stats.episodeCount > 0 ? (stats.shotCount / stats.episodeCount).toFixed(1) : "0.0";
  const productionState = resolveProjectProductionState(stats, videoCoverage);
  return `
    <section class="project-info-panel project-stats-dashboard" aria-label="产能统计">
      <header class="project-stats-hero">
        <div class="project-stats-hero-copy">
          <span class="project-stats-kicker">PROJECT PRODUCTION</span>
          <h1>产能总览</h1>
          <p>从剧集结构到成片交付，聚合当前项目的真实生产进度。</p>
          <div class="project-stats-status-line">
            <i aria-hidden="true"></i>
            <strong>${escapeHtml(productionState.label)}</strong>
            <span>${escapeHtml(productionState.description)}</span>
          </div>
        </div>
        <div class="project-stats-hero-figures" aria-label="项目核心产能">
          ${renderProjectStatMetric("累计产出", outputCount, "画面与视频", "image")}
          ${renderProjectStatMetric("分镜规模", stats.shotCount, "规划镜头", "story")}
          ${renderProjectStatMetric("资产储备", stats.assetCount, "角色 场景 道具", "role")}
        </div>
        <div class="project-stats-ring" style="--project-progress: ${videoCoverage}" aria-label="成片覆盖率 ${videoCoverage}%">
          <div>
            <strong>${videoCoverage}<small>%</small></strong>
            <span>成片覆盖率</span>
          </div>
        </div>
      </header>

      <div class="project-stats-content">
        <section class="project-stats-production" aria-labelledby="project-production-title">
          <div class="project-stats-section-heading">
            <div>
              <span>PRODUCTION FLOW</span>
              <h2 id="project-production-title">生产链路</h2>
            </div>
            <p>画面覆盖 ${imageCoverage}% · 成片覆盖 ${videoCoverage}%</p>
          </div>
          <div class="project-production-flow">
            ${renderProjectProductionStage("剧集", stats.episodeCount, "分集结构", "book", 100)}
            ${renderProjectProductionStage("分镜", stats.shotCount, "镜头规划", "story", 100)}
            ${renderProjectProductionStage("图片生成", stats.generatedImageCount, "画面就绪", "image", imageCoverage)}
            ${renderProjectProductionStage("视频生成", stats.generatedVideoCount, "成片就绪", "video", videoCoverage)}
          </div>
        </section>

        <aside class="project-stats-delivery" aria-labelledby="project-delivery-title">
          <div class="project-stats-section-heading">
            <div>
              <span>DELIVERY</span>
              <h2 id="project-delivery-title">交付脉搏</h2>
            </div>
          </div>
          <div class="project-delivery-figure">
            <span>${renderCanvasIcon("download")}</span>
            <strong>${escapeHtml(String(stats.exportCount))}</strong>
            <p>累计导出</p>
          </div>
          <div class="project-delivery-meta">
            <span>最近活动</span>
            <strong>${escapeHtml(formatProjectStatsActivity(stats.lastActivityAt))}</strong>
          </div>
        </aside>
      </div>

      <section class="project-stats-efficiency" aria-labelledby="project-efficiency-title">
        <div class="project-stats-section-heading">
          <div>
            <span>PROJECT SIGNALS</span>
            <h2 id="project-efficiency-title">项目信号</h2>
          </div>
        </div>
        <div class="project-stats-signal-grid">
          ${renderProjectStatSignal("协作成员", stats.memberCount, "人", "user")}
          ${renderProjectStatSignal("单集镜头", shotsPerEpisode, "镜头 / 集", "story")}
          ${renderProjectStatSignal("画面覆盖", imageCoverage, "%", "image")}
          ${renderProjectStatSignal("视频覆盖", videoCoverage, "%", "video")}
        </div>
      </section>

    </section>
  `;
}

function renderProjectProductionStage(label, value, caption, icon, percentage) {
  return `
    <article class="project-production-stage">
      <div class="project-production-stage-icon" aria-hidden="true">${renderCanvasIcon(icon)}</div>
      <div class="project-production-stage-copy">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(String(value))}</strong>
        <small>${escapeHtml(caption)}</small>
      </div>
      <div class="project-production-stage-track" aria-hidden="true">
        <i style="--stage-progress: ${Math.max(0, Math.min(100, percentage))}"></i>
      </div>
    </article>
  `;
}

function renderProjectStatSignal(label, value, unit, icon) {
  return `
    <article class="project-stat-signal">
      <span class="project-stat-signal-icon" aria-hidden="true">${renderCanvasIcon(icon)}</span>
      <div>
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(String(value))}<small>${escapeHtml(unit)}</small></strong>
      </div>
    </article>
  `;
}

function normalizeProjectStats(apiStats = {}) {
  return {
    memberCount: coerceNonNegativeInteger(apiStats?.memberCount),
    episodeCount: coerceNonNegativeInteger(apiStats?.episodeCount),
    shotCount: coerceNonNegativeInteger(apiStats?.shotCount),
    assetCount: coerceNonNegativeInteger(apiStats?.assetCount),
    exportCount: coerceNonNegativeInteger(apiStats?.exportCount),
    generatedImageCount: coerceNonNegativeInteger(apiStats?.generatedImageCount),
    generatedVideoCount: coerceNonNegativeInteger(apiStats?.generatedVideoCount),
    lastActivityAt: apiStats?.lastActivityAt ?? null,
  };
}

function coerceNonNegativeInteger(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
}

function calculateProjectStatPercentage(value, total) {
  if (total <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((value / total) * 100));
}

function resolveProjectProductionState(stats, videoCoverage) {
  if (stats.shotCount === 0) {
    return { label: "结构搭建中", description: "从剧集和分镜规划开始推进" };
  }
  if (stats.generatedImageCount === 0) {
    return { label: "分镜规划中", description: `已规划 ${stats.shotCount} 个镜头` };
  }
  if (stats.generatedVideoCount === 0) {
    return { label: "画面生产中", description: `已有 ${stats.generatedImageCount} 个镜头完成定帧` };
  }
  if (videoCoverage < 100) {
    return { label: "视频合成中", description: `${stats.generatedVideoCount} / ${stats.shotCount} 个镜头已形成视频` };
  }
  return { label: "已具备交付条件", description: "全部规划镜头均已有视频产出" };
}

function formatProjectStatsActivity(value) {
  const formatted = formatTaskCenterTime(value, true);
  return formatted === "-" ? "暂无记录" : formatted;
}

function renderProjectStatMetric(label, value, caption = "", icon = "image") {
  return `
    <article class="project-info-card stat-card">
      <span class="project-stat-metric-icon" aria-hidden="true">${renderCanvasIcon(icon)}</span>
      <div>
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(String(value))}</strong>
        ${caption ? `<small>${escapeHtml(caption)}</small>` : ""}
      </div>
    </article>
  `;
}

function normalizeProjectInteriorSection(section) {
  const normalized = String(section ?? "overview");
  return INTERIOR_NAV_ITEMS.some((item) => item.id === normalized) ? normalized : "overview";
}

function renderProjectOverviewInterior({ state, ui, detailState, aspectRatio, hasAssets, episodeCount }) {
  const episodes = getEpisodeHubEntries(state, ui);
  const overviewEpisodes = episodes.slice(0, 12);
  const hasEpisodes = episodes.length > 0;
  const primaryEpisodeTitle = overviewEpisodes[0]?.title || detailState.episodes?.[0]?.title || "剧一";
  const selectedProject = getSelectedProjectCard(ui);
  const projectName = normalizeProjectOverviewCurrentProjectName(
    selectedProject?.name ??
      detailState.project?.name ??
      state.project?.name ??
      "",
  );
  const statusLabel = detailState.project?.statusLabel || state.project?.statusLabel || state.project?.phase || "创作中";
  return `
    <section class="project-settings-panel">
      ${renderProjectOverviewBrief({ projectName, statusLabel, aspectRatio, episodeCount })}
      <section id="asset-prep-section" class="interior-section asset-prep-section" aria-label="资产准备">
        <div class="asset-prep-grid">
          ${renderInteriorAssetCard("角色", "character", "violet", detailState.assets.characters, detailState.assets.previews?.character)}
          ${renderInteriorAssetCard("场景", "scene", "teal", detailState.assets.scenes, detailState.assets.previews?.scene)}
          ${renderInteriorAssetCard("道具", "prop", "ochre", detailState.assets.props, detailState.assets.previews?.prop)}
          ${renderInteriorAssetCard("音频", "other", "cyan", detailState.assets.others, detailState.assets.previews?.other)}
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
            ? renderOverviewEpisodePanel({ episodes: overviewEpisodes, ui })
            : `
                <div class="episode-empty-canvas">
                  <div class="episode-canvas-glow"></div>
                  <div class="episode-canvas-copy always-visible">
                    <strong>从这里开始创建第一集</strong>
                    <span>
                      从 <button type="button" class="episode-inline-link" data-action="open-single-episode-flow">单集创建</button>
                    </span>
                  </div>
                </div>
              `
        }
      </section>
    </section>
  `;
}

function renderProjectOverviewBrief({ projectName, statusLabel, aspectRatio, episodeCount }) {
  return `
    <section class="project-overview-brief" aria-label="项目总览信息">
      <div class="project-overview-brief__title">
        <strong>工作台</strong>
      </div>
      <div class="project-overview-brief__chips">
        ${renderProjectOverviewBriefChip("当前项目", projectName, "project")}
        ${renderProjectOverviewBriefChip("状态", statusLabel || "创作中", "status")}
        ${aspectRatio ? renderProjectOverviewBriefChip("画幅", aspectRatio, "ratio") : ""}
        ${renderProjectOverviewBriefChip("剧集", `${episodeCount} 集`, "episode")}
      </div>
    </section>
  `;
}

function normalizeProjectOverviewCurrentProjectName(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return "";
  }
  return normalized.toLowerCase() === "try" ? "" : normalized;
}

function renderProjectOverviewBriefChip(label, value, tone = "") {
  return `
    <article class="project-overview-brief-chip ${tone ? `tone-${escapeAttr(tone)}` : ""}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
    </article>
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
      <div class="episode-hub-cards">
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
      <div class="episode-hub-grid">
        <div class="episode-hub-launches">
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
          <p>${escapeHtml(formatEpisodeHubDate(episode.createdAt ?? episode.createdAtMs ?? ""))}</p>
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

function renderSingleEpisodeModal(ui, state = {}) {
  const aiStoryboardActionLabel = resolveSingleEpisodeAiActionLabel(ui);
  const isCheckingAiStoryboard = Boolean(ui.singleEpisodeAiChecking);
  const selectedSkillCount = resolveSelectedEpisodePromptSkills(ui).length;
  const selectedTextModelCode = resolveSingleEpisodeTextModelCode(ui);
  const scriptPicker = resolveSingleEpisodeScriptPicker(state, ui);
  const scriptInput = truncateScriptTextByCharacters(ui.singleEpisodeScript, 5000);
  return `
    <section class="modal-backdrop" role="dialog" aria-modal="true" aria-label="新建剧集">
      <div class="single-episode-modal single-episode-studio">
        <div class="single-episode-modal-head">
          <div class="single-episode-modal-heading">
            <h2>请输入您的剧本开始创作</h2>
          </div>
          <button class="modal-close" type="button" data-action="close-single-episode-modal" aria-label="关闭">×</button>
        </div>
        ${renderSingleEpisodeScriptImport(scriptPicker, isCheckingAiStoryboard, ui.singleEpisodeScriptImportMenu)}
        <label class="single-episode-field single-episode-script-field">
          <textarea id="single-episode-script-input" maxlength="5000" placeholder="例如：深夜暴雨中，女主在便利店门口第一次遇见失忆的男主，空气里有霓虹反光和一点危险感。">${escapeHtml(scriptInput)}</textarea>
          <span class="single-episode-count">${[...scriptInput].length}/5000</span>
        </label>
        ${ui.singleEpisodeNotice ? `<p class="single-episode-inline-notice">${escapeHtml(ui.singleEpisodeNotice)}</p>` : ""}
        ${isCheckingAiStoryboard ? `
          <div class="single-episode-checking" role="status" aria-live="polite">
            <span class="single-episode-checking-spinner" aria-hidden="true"></span>
            <div>
              <strong>正在分析中</strong>
              <small>正在读取会员与积分校验结果，通过后会自动开始 AI 分镜生成。</small>
            </div>
          </div>
        ` : ""}
        <div class="single-episode-toolbar single-episode-toolbar-replica">
          <div class="single-episode-toolbar-left">
            <div class="single-episode-look-controls single-episode-skill-controls">
              ${renderSingleEpisodeTextModelControl(ui)}
              ${renderEpisodePromptSkillControl({
                skills: resolveEpisodePromptSkillItems(ui),
                selectedByCategory: ui.selectedEpisodePromptSkillIds,
                loading: ui.episodePromptSkillLoading,
              })}
            </div>
          </div>
          <div class="single-episode-actions">
            <button class="single-episode-ghost-action" type="button" data-action="create-empty-single-episode" ${isCheckingAiStoryboard ? "disabled" : ""}>创建空白章节</button>
            <button class="primary-action single-episode-ai-action" type="button" data-action="confirm-single-episode" ${isCheckingAiStoryboard || !selectedSkillCount || !selectedTextModelCode ? "disabled" : ""}>${escapeHtml(isCheckingAiStoryboard ? "正在分析中..." : aiStoryboardActionLabel)}</button>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderSingleEpisodeTextModelControl(ui = {}) {
  const models = resolveSingleEpisodeTextModels(ui);
  const selectedModelCode = resolveSingleEpisodeTextModelCode(ui);
  const selectedModel = models.find((model) => model.modelCode === selectedModelCode) ?? models[0];
  const isOpen = ui.singleEpisodeLookPanel === "text-model";
  return `
    <section class="single-episode-look-select single-episode-text-model-control ${isOpen ? "open" : ""}" aria-label="文本模型">
      <div class="single-episode-look-label"><span>文本模型</span></div>
      <button
        class="single-episode-look-trigger single-episode-text-model-trigger"
        type="button"
        data-action="toggle-single-episode-text-model-menu"
        aria-haspopup="listbox"
        aria-expanded="${isOpen ? "true" : "false"}"
      >
        <span title="${escapeAttr(selectedModel?.modelLabel ?? "后台未配置文本模型")}">${escapeHtml(selectedModel?.modelLabel ?? "后台未配置文本模型")}</span>
        <span class="single-episode-look-trigger__icon" aria-hidden="true">${renderUiChevronIcon(isOpen ? "up" : "down")}</span>
      </button>
      ${isOpen ? `
        <div class="single-episode-look-dropdown single-episode-text-model-dropdown" role="listbox" aria-label="选择文本模型">
          ${models.map((model) => {
            const credits = resolveConfiguredModelCredits(model.raw);
            return `
              <button
                class="single-episode-text-model-option ${model.modelCode === selectedModelCode ? "active" : ""}"
                type="button"
                role="option"
                aria-selected="${model.modelCode === selectedModelCode ? "true" : "false"}"
                data-action="select-single-episode-text-model"
                data-model-code="${escapeAttr(model.modelCode)}"
              >
                <strong>${escapeHtml(model.modelLabel)}</strong>
                <small>${credits ? `${escapeHtml(credits)}积分/次` : "免费"}</small>
              </button>
            `;
          }).join("")}
        </div>
      ` : ""}
    </section>
  `;
}

function resolveSingleEpisodeScriptPicker(state = {}, ui = {}) {
  const rawPicker = ui.singleEpisodeScriptPicker && typeof ui.singleEpisodeScriptPicker === "object"
    ? ui.singleEpisodeScriptPicker
    : {};
  const scripts = resolveSingleEpisodeScriptLibrary(state, ui);
  const pagination = normalizeSingleEpisodeScriptLibraryPagination(ui.singleEpisodeScriptLibraryPagination, {
    page: rawPicker.page ?? 1,
    pageSize: 10,
    total: scripts.length,
    totalPages: 1,
  });
  const scriptId = String(rawPicker.scriptId ?? "").trim();
  const selectedScript = rawPicker.selectedScript && typeof rawPicker.selectedScript === "object"
    ? normalizeSingleEpisodeScriptRecord(rawPicker.selectedScript, rawPicker.selectedScript.sections ?? rawPicker.selectedScript.episodes ?? [])
    : (scriptId ? scripts.find((script) => script.id === scriptId) ?? null : null);
  const selectedSections = Array.isArray(rawPicker.selectedSections)
    ? rawPicker.selectedSections
      .map((section, index) => normalizeScriptReaderSection(section, {
        id: section?.id ?? `${scriptId || selectedScript?.id || "script"}-section-${index + 1}`,
        title: section?.title ?? `第${index + 1}章`,
        text: section?.body ?? section?.text ?? "",
      }))
      .filter(Boolean)
    : [];
  const items = selectedScript
    ? (selectedSections.length
      ? selectedSections
      : (selectedScript.sections?.length ? selectedScript.sections : selectedScript.episodes ?? []))
    : scripts;
  return {
    open: rawPicker.open === true,
    scriptId,
    selectedEpisodeId: String(rawPicker.selectedEpisodeId ?? "").trim(),
    selectedScript,
    selectedSections,
    items,
    scripts,
    selectedLabel: String(rawPicker.selectedLabel ?? "").trim(),
    loadingSections: rawPicker.loadingSections === true,
    pagination,
  };
}

function normalizeScriptReaderSection(section = {}, fallback = {}) {
  return {
    ...fallback,
    ...section,
    id: String(section?.id ?? fallback.id ?? ""),
    title: String(section?.title ?? fallback.title ?? "新增剧情"),
    text: String(section?.body ?? section?.text ?? fallback.text ?? ""),
  };
}

function renderSingleEpisodeScriptImport(picker, isDisabled, openMenu = "") {
  const hasScripts = picker.scripts.length > 0;
  const hasSelectedScript = Boolean(picker.selectedScript);
  const chapters = hasSelectedScript ? picker.items : [];
  const selectedScriptLabel = picker.selectedScript?.title || "请选择剧本";
  const selectedChapter = chapters.find((chapter) => chapter.id === picker.selectedEpisodeId);
  const chapterPlaceholder = picker.loadingSections
    ? "正在加载章节..."
    : hasSelectedScript
      ? (chapters.length ? "请选择章节" : "当前剧本暂无章节")
      : "请先选择剧本";
  const isScriptMenuOpen = openMenu === "script";
  const isChapterMenuOpen = openMenu === "chapter";
  return `
    <div class="single-episode-script-import">
      <section class="single-episode-script-select-field ${isScriptMenuOpen ? "is-open" : ""}" aria-label="剧本">
        <div class="single-episode-script-label">
          <span>剧本</span>
          <button
            class="single-episode-script-help"
            type="button"
            aria-label="剧本添加说明"
            aria-describedby="single-episode-script-help-tooltip"
          >
            ?
            <span id="single-episode-script-help-tooltip" class="single-episode-script-help-tooltip" role="tooltip">请前往剧本菜单添加</span>
          </button>
        </div>
        <button
          id="single-episode-script-select"
          class="single-episode-look-trigger single-episode-script-select-trigger"
          type="button"
          data-action="toggle-single-episode-import-menu"
          data-menu-key="script"
          aria-haspopup="listbox"
          aria-expanded="${isScriptMenuOpen ? "true" : "false"}"
          ${isDisabled || !hasScripts ? "disabled" : ""}
        >
          <span class="single-episode-script-select-value">${escapeHtml(hasScripts ? selectedScriptLabel : "暂无可用剧本")}</span>
          <span class="single-episode-look-trigger__icon" aria-hidden="true">${renderUiChevronIcon(isScriptMenuOpen ? "up" : "down")}</span>
        </button>
        ${isScriptMenuOpen ? `
          <div class="single-episode-script-select-menu" role="listbox" aria-label="剧本">
            ${picker.scripts.map((script) => `
              <button
                class="${script.id === picker.scriptId ? "is-selected" : ""}"
                type="button"
                role="option"
                aria-selected="${script.id === picker.scriptId ? "true" : "false"}"
                data-action="select-single-episode-script-source"
                data-script-id="${escapeAttr(script.id)}"
              >
                <span>${escapeHtml(script.title || "未命名剧本")}</span>
                ${script.id === picker.scriptId ? `<i aria-hidden="true">✓</i>` : ""}
              </button>
            `).join("")}
          </div>
        ` : ""}
      </section>
      <section class="single-episode-script-select-field ${isChapterMenuOpen ? "is-open" : ""}" aria-label="章节">
        <div class="single-episode-script-label"><span>章节</span></div>
        <button
          id="single-episode-chapter-select"
          class="single-episode-look-trigger single-episode-script-select-trigger"
          type="button"
          data-action="toggle-single-episode-import-menu"
          data-menu-key="chapter"
          aria-haspopup="listbox"
          aria-expanded="${isChapterMenuOpen ? "true" : "false"}"
          ${isDisabled || !hasSelectedScript || picker.loadingSections || !chapters.length ? "disabled" : ""}
        >
          <span class="single-episode-script-select-value">${escapeHtml(selectedChapter?.title || chapterPlaceholder)}</span>
          <span class="single-episode-look-trigger__icon" aria-hidden="true">${renderUiChevronIcon(isChapterMenuOpen ? "up" : "down")}</span>
        </button>
        ${isChapterMenuOpen ? `
          <div class="single-episode-script-select-menu" role="listbox" aria-label="章节">
            ${chapters.map((chapter) => `
              <button
                class="${chapter.id === picker.selectedEpisodeId ? "is-selected" : ""}"
                type="button"
                role="option"
                aria-selected="${chapter.id === picker.selectedEpisodeId ? "true" : "false"}"
                data-action="apply-single-episode-script"
                data-script-id="${escapeAttr(picker.scriptId)}"
                data-episode-id="${escapeAttr(chapter.id)}"
              >
                <span>${escapeHtml(chapter.title || "未命名章节")}</span>
                ${chapter.id === picker.selectedEpisodeId ? `<i aria-hidden="true">✓</i>` : ""}
              </button>
            `).join("")}
          </div>
        ` : ""}
      </section>
    </div>
  `;
}

function renderSingleEpisodeScriptPickerOverlay(picker) {
  if (!picker.open) {
    return "";
  }
  return `
    <section class="single-episode-script-overlay" role="dialog" aria-modal="true" aria-label="剧本导入">
      <button class="single-episode-script-overlay-mask" type="button" data-action="close-single-episode-script-picker" aria-label="关闭剧本导入"></button>
      <div class="single-episode-script-overlay-card">
        ${renderSingleEpisodeScriptPickerPanel(picker)}
      </div>
    </section>
  `;
}

function renderSingleEpisodeScriptPickerPanel(picker) {
  const title = "选择剧本与目录";
  const hasSelectedScript = Boolean(picker.selectedScript);
  const pagination = picker.pagination ?? { page: 1, pageSize: 10, total: 0, totalPages: 1 };
  return `
    <div class="single-episode-script-picker" aria-label="${escapeAttr(title)}">
      <header>
        <strong>${escapeHtml(title)}</strong>
        ${hasSelectedScript ? `<span class="single-episode-script-picker-hint">先选目录，再写入内容</span>` : `<span class="single-episode-script-picker-hint">选择一个剧本后继续</span>`}
      </header>
      <div class="single-episode-script-picker-body">
        <section class="single-episode-script-picker-column">
          <strong>剧本</strong>
          <div class="single-episode-script-picker-list">
            ${picker.scripts.length
              ? picker.scripts.map((item) => renderSingleEpisodeScriptPickerItem(item, picker)).join("")
              : "<p>暂无可导入剧本</p>"}
          </div>
        </section>
        <section class="single-episode-script-picker-column">
          <strong>${escapeHtml(hasSelectedScript ? "目录" : "章节预览")}</strong>
          <div class="single-episode-script-picker-list">
            ${hasSelectedScript
              ? (picker.items.length
                ? picker.items.map((item) => renderSingleEpisodeScriptEpisodeItem(item, picker)).join("")
                : `<p>当前剧本暂无可导入章节</p>`)
              : `<p>请选择左侧剧本后查看目录</p>`}
          </div>
        </section>
      </div>
      ${renderSingleEpisodeScriptPickerPagination(pagination)}
    </div>
  `;
}

function renderSingleEpisodeScriptPickerPagination(pagination = {}) {
  const page = Math.max(1, Number(pagination.page ?? 1));
  const pageSize = Math.max(1, Number(pagination.pageSize ?? 10));
  const total = Math.max(0, Number(pagination.total ?? 0));
  const totalPages = Math.max(1, Number(pagination.totalPages ?? 1));
  if (!total) {
    return "";
  }
  return `
    <footer class="single-episode-script-picker-pagination" aria-label="剧本分页">
      <span>共 ${escapeHtml(String(total))} 本，每页 ${escapeHtml(String(pageSize))} 本</span>
      <div class="single-episode-script-picker-pagination-controls">
        <button type="button" data-action="change-single-episode-script-page" data-page="${escapeAttr(String(page - 1))}" ${page <= 1 ? "disabled" : ""}>上一页</button>
        <strong>${escapeHtml(String(page))} / ${escapeHtml(String(totalPages))}</strong>
        <button type="button" data-action="change-single-episode-script-page" data-page="${escapeAttr(String(page + 1))}" ${page >= totalPages ? "disabled" : ""}>下一页</button>
      </div>
    </footer>
  `;
}

function resolveSingleEpisodeScriptLibrary(state = {}, ui = {}) {
  const scriptRecords = Array.isArray(ui?.singleEpisodeScriptLibrary) ? ui.singleEpisodeScriptLibrary : [];
  const records = [];
  const pushRecord = (record) => {
    if (!record?.id || records.some((item) => item.id === record.id)) {
      return;
    }
    records.push(record);
  };
  scriptRecords.forEach((record) => {
    pushRecord(
      normalizeSingleEpisodeScriptRecord(
        record.script ?? record,
        record.episodes ??
          record.sections ??
          record.script?.episodes ??
          record.script?.sections ??
          [],
      ),
    );
  });
  return records;
}

function normalizeSingleEpisodeScriptLibraryPagination(value, fallback = {}) {
  const pageSize = Math.max(1, Math.min(100, Math.floor(Number(value?.pageSize ?? fallback.pageSize ?? 10)) || 10));
  const totalValue = Number(value?.total);
  const fallbackTotal = Math.max(0, Number(fallback.total ?? 0));
  const total = Number.isFinite(totalValue) && totalValue > 0 ? totalValue : fallbackTotal;
  const totalPages = Math.max(1, Number(value?.totalPages ?? Math.ceil(total / pageSize) ?? 1));
  const page = Math.min(totalPages, Math.max(1, Number(value?.page ?? fallback.page ?? 1)));
  return {
    page,
    pageSize,
    total,
    totalPages,
  };
}

function normalizeSingleEpisodeScriptRecord(script = {}, episodes = []) {
  const id = String(script.id ?? script.scriptId ?? "").trim();
  if (!id) {
    return null;
  }
  const directSections = Array.isArray(episodes) && episodes.length
    ? episodes.map((episode, index) => ({
        id: String(episode.id ?? episode.episodeId ?? `episode-${index + 1}`),
        title: String(episode.title ?? episode.name ?? `第${index + 1}集`),
        text: String(
          episode.scriptText ??
          episode.inputText ??
          episode.text ??
          episode.summary ??
          script.inputText ??
          script.text ??
          script.content ??
          "",
        ),
        storyboardCount: Number(episode.storyboardCount ?? episode.shots?.length ?? 0),
      }))
    : [];
  const inferredSections = splitSingleEpisodeScriptTextIntoSections(script, episodes);
  const sections = directSections.length > 1
    ? directSections
    : (inferredSections.length > 1 ? inferredSections : directSections);
  return {
    id,
    title: String(script.title ?? script.name ?? "项目剧本"),
    type: String(script.typeLabel ?? script.type ?? script.scriptType ?? "原始剧本"),
    text: String(script.inputText ?? script.text ?? script.content ?? ""),
    sections,
    episodes: sections,
  };
}

function splitSingleEpisodeScriptTextIntoSections(script = {}, episodes = []) {
  const text = String(script.inputText ?? script.text ?? script.content ?? "").replace(/\r\n?/g, "\n").trim();
  if (!text) {
    return [];
  }
  const headingPattern = /(^|\n)\s*(第\s*(?:\d+|[一二三四五六七八九十百千两]+)\s*[章节集幕][^\n]*)/g;
  const matches = [...text.matchAll(headingPattern)];
  if (!matches.length) {
    return [{
      id: String(script.id ?? script.scriptId ?? "script-reader-primary"),
      title: String(script.title ?? script.name ?? "第1集"),
      text,
      storyboardCount: 0,
    }];
  }
  return matches.map((match, index) => {
    const title = String(match[2] ?? `第${index + 1}集`).trim();
    const start = (match.index ?? 0) + String(match[0] ?? "").length;
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? text.length) : text.length;
    const body = text.slice(start, end).trim();
    return {
      id: `${String(script.id ?? script.scriptId ?? "script-reader")}-${index + 1}`,
      title,
      text: body ? `${title}\n${body}` : title,
      storyboardCount: 0,
    };
  });
}

function renderSingleEpisodeScriptPickerItem(script = {}) {
  const subtitle = script.type || (script.sections?.length || script.episodes?.length ? "含章节内容" : "原始剧本");
  return `
    <button type="button" data-action="select-single-episode-script-source" data-script-id="${escapeAttr(script.id)}">
      ${renderCanvasIcon("book")}
      <span>
        <strong>${escapeHtml(script.title || "未命名剧本")}</strong>
        <small>${escapeHtml(subtitle)}</small>
      </span>
    </button>
  `;
}

function renderSingleEpisodeScriptEpisodeItem(episode = {}, picker = {}) {
  const summary = episode.storyboardCount ? `${String(episode.storyboardCount)} 分镜` : "写入章节文本";
  return `
    <button
      type="button"
      data-action="apply-single-episode-script"
      data-script-id="${escapeAttr(picker.scriptId)}"
      data-episode-id="${escapeAttr(episode.id)}"
    >
      ${renderCanvasIcon("story")}
      <span>
        <strong>${escapeHtml(episode.title || "未命名章节")}</strong>
        <small>${escapeHtml(summary)}</small>
      </span>
    </button>
  `;
}

function resolveSingleEpisodeAiActionLabel(ui = {}) {
  const modelCredits = Number(resolveSingleEpisodeModelCreditsByCode(ui, resolveSingleEpisodeTextModelCode(ui))) || 0;
  const selectedSkills = resolveSelectedEpisodePromptSkills(ui);
  const selectedSkillCount = selectedSkills.length;
  if (!modelCredits || !selectedSkillCount) {
    return "AI 小说分镜";
  }
  const skillCredits = selectedSkills.reduce((sum, skill) => sum + Math.max(0, Number(skill.priceCredits) || 0), 0);
  return `AI 小说分镜 ${formatModelAndSkillCredits(modelCredits * selectedSkillCount, skillCredits)}`;
}

function resolveSelectedEpisodePromptSkills(ui = {}) {
  const selectedIds = new Set(Object.values(ui.selectedEpisodePromptSkillIds ?? {}).map(String).filter(Boolean));
  return resolveEpisodePromptSkillItems(ui).filter((skill) => selectedIds.has(String(skill.id)));
}

function resolveSingleEpisodeTextModels(ui = {}) {
  const models = resolveCanvasModelOptions(ui.episodeGenerationConfig ?? {}, "text");
  if (models.length) {
    return models;
  }
  const fallbackCode = String(ui.singleEpisodeTextModelCode ?? "deepseek-script").trim() || "deepseek-script";
  return [{ modelCode: fallbackCode, modelLabel: fallbackCode, raw: {} }];
}

export function resolveSingleEpisodeTextModelCode(ui = {}) {
  const models = resolveSingleEpisodeTextModels(ui);
  const requestedCode = String(ui.singleEpisodeTextModelCode ?? "").trim();
  const defaultCode = String(ui.episodeGenerationConfig?.defaultTextModelCode ?? "").trim();
  return models.find((model) => model.modelCode === requestedCode)?.modelCode
    ?? models.find((model) => model.modelCode === defaultCode)?.modelCode
    ?? models[0]?.modelCode
    ?? "";
}

function resolveSingleEpisodeStoryboardActionLabel(ui = {}) {
  const modelCredits = resolveSingleEpisodeModelCreditsByCode(ui, "deepseek-noval");
  if (!modelCredits) {
    return "AI剧本分镜";
  }
  const skillCredits = sumEpisodePromptSkillCredits(
    resolveEpisodePromptSkillItems(ui),
    ui.selectedEpisodePromptSkillIds,
    ["script"],
  );
  return `AI剧本分镜 ${formatModelAndSkillCredits(modelCredits, skillCredits)}`;
}

function formatModelAndSkillCredits(modelCredits, skillCredits) {
  const normalizedSkillCredits = Math.max(0, Number(skillCredits) || 0);
  return normalizedSkillCredits > 0
    ? `${modelCredits} + ${normalizedSkillCredits}积分`
    : `${modelCredits}积分`;
}

function resolveSingleEpisodeModelCreditsByCode(ui = {}, modelCode = "") {
  const normalizedModelCode = String(modelCode ?? "").trim().toLowerCase();
  if (!normalizedModelCode) {
    return "";
  }
  const models = Array.isArray(ui.episodeGenerationConfig?.models)
    ? ui.episodeGenerationConfig.models
    : [];
  const model = models.find((item) => {
    const itemCode = String(item?.modelCode ?? item?.model_code ?? item?.id ?? "").trim().toLowerCase();
    return itemCode === normalizedModelCode;
  });
  return model ? resolveConfiguredModelCredits(model) : "";
}

function resolveConfiguredModelCredits(model = {}) {
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
  return "";
}

function isScriptGenerationModel(model = {}) {
  const source = model && typeof model === "object" ? model : {};
  const mediaType = String(source.mediaType ?? source.media_type ?? source.mediaKind ?? source.media_kind ?? "").trim().toLowerCase();
  const uiConfig = source.uiConfig && typeof source.uiConfig === "object" && !Array.isArray(source.uiConfig)
    ? source.uiConfig
    : {};
  const tokens = [
    source.modelCode,
    source.model_code,
    source.id,
    source.modelKind,
    source.model_kind,
    uiConfig.modelKind,
    ...(Array.isArray(source.supportedModes) ? source.supportedModes : []),
    ...(Array.isArray(source.taskModes) ? source.taskModes : []),
    ...(Array.isArray(source.task_modes) ? source.task_modes : []),
    ...(Array.isArray(source.taskModesJson) ? source.taskModesJson : []),
    ...(Array.isArray(source.task_modes_json) ? source.task_modes_json : []),
    ...(Array.isArray(uiConfig.supportedModes) ? uiConfig.supportedModes : []),
  ].map((item) => String(item ?? "").trim().toLowerCase()).filter(Boolean);
  return (
    mediaType === "text" ||
    tokens.some((token) => token === "text.script" || token === "script" || token.includes("script"))
  );
}

export function renderSingleEpisodeAiPreview(ui) {
  const preview = ui.singleEpisodeAiPreview ?? { status: "idle", data: null, error: "" };
  const previewTitle = preview.source === "single-episode-script-storyboard" ? "AI剧本分镜" : "AI小说分镜";
  const previewAriaLabel = preview.source === "single-episode-script-storyboard" ? "AI 剧本分镜" : "AI 小说分镜";
  if (!preview || preview.status === "idle") {
    return "";
  }
  if (preview.source === "manual-script-analysis") {
    return renderManualScriptAnalysisPreview(preview);
  }
  if (preview.status === "loading") {
    return `
      <section class="single-episode-ai-overlay" role="dialog" aria-modal="true" aria-label="${escapeAttr(previewAriaLabel)}">
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
        <div class="single-episode-ai-preview loading" aria-live="polite" data-single-episode-ai-preview-surface="true">
          ${renderSingleEpisodeAiSentPrompts(preview)}
          ${renderSingleEpisodeAiLiveTables(preview)}
        </div>
      </section>
    `;
  }
  if (preview.status === "error") {
    return `
      <section class="single-episode-ai-overlay" role="dialog" aria-modal="true" aria-label="${escapeAttr(`${previewAriaLabel}生成失败`)}">
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
  if (preview.status === "submitting") {
    return `
      <section class="single-episode-ai-overlay" role="dialog" aria-modal="true" aria-busy="true" aria-label="正在创建章节">
        <div class="single-episode-ai-overlay-top">
          <button class="single-episode-ai-back" type="button" disabled>‹ 返回</button>
          <div class="single-episode-ai-overlay-actions">
            <button class="single-episode-ai-create" type="button" disabled>创建中...</button>
            <button class="single-episode-ai-close" type="button" aria-label="创建中，暂时无法关闭" disabled>×</button>
          </div>
        </div>
        <div class="single-episode-ai-preview ready submitting">
          <div class="single-episode-ai-preview-head">
            <div>
              <p>AI Storyboard</p>
              <h3>${escapeHtml(previewTitle)}</h3>
            </div>
            <p>创建中，请稍候，完成后会自动进入分镜工作台。</p>
          </div>
          ${renderSingleEpisodeAiSentPrompts(preview, { mode: "ready" })}
          <div class="single-episode-ai-table-stack">
            ${SINGLE_EPISODE_AI_TABLE_ORDER
              .map((key) => renderSingleEpisodeAiTable(resolveSingleEpisodeAiRenderTables(preview)[key], key))
              .join("")}
          </div>
        </div>
        <div class="single-episode-ai-submitting-lock">
          <div class="single-episode-ai-submitting-dialog" role="status" aria-live="assertive">
            <span class="single-episode-ai-submitting-spinner" aria-hidden="true"></span>
            <div>
              <p>AI Storyboard</p>
              <h3>正在创建章节</h3>
            </div>
            <p class="single-episode-ai-submitting-message">正在保存剧本、角色、场景和分镜，请稍候。</p>
          </div>
        </div>
      </section>
    `;
  }
  const tables = resolveSingleEpisodeAiRenderTables(preview);
  return `
      <section class="single-episode-ai-overlay" role="dialog" aria-modal="true" aria-label="${escapeAttr(`${previewAriaLabel}结果`)}">
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
              <h3>${escapeHtml(previewTitle)}</h3>
            </div>
          </div>
          ${renderSingleEpisodeAiSentPrompts(preview, { mode: "ready" })}
          <div class="single-episode-ai-table-stack">
            ${SINGLE_EPISODE_AI_TABLE_ORDER
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
  const title = isError ? "分析失败" : isLoading ? "AI 正在分析剧本" : "AI 剧本分析结果";
  const saveDisabled = isLoading || isError || !resolveManualScriptAnalysisText(preview).trim();
  return `
    <section class="single-episode-ai-overlay manual-script-analysis-overlay" role="dialog" aria-modal="true" aria-label="AI 剧本分析">
      <div class="single-episode-ai-overlay-top manual-script-analysis-top">
        <button class="single-episode-ai-back" type="button" data-action="close-ai-storyboard-preview">‹ 返回</button>
        <div class="single-episode-ai-top-status" aria-live="polite">
          <p>AI Script</p>
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
      <div class="single-episode-ai-preview manual-script-analysis-preview ${escapeAttr(preview.status)}" aria-live="polite" data-single-episode-ai-preview-surface="true">
        ${isError
          ? `<p class="single-episode-ai-error">${escapeHtml(preview.error || "请稍后重试")}</p>`
          : renderManualScriptAnalysisOutput(preview)}
      </div>
    </section>
  `;
}

function renderManualScriptAnalysisOutput(preview) {
  const text = truncateSingleEpisodeAiPreviewText(resolveManualScriptAnalysisText(preview), 30000);
  return `
    <article class="manual-script-analysis-output">
      <header>
        <strong>剧本</strong>
        <span>${preview.status === "loading" ? "实时返回中" : "已完成"}</span>
      </header>
      <pre>${escapeHtml(text || "等待 AI 返回剧本内容...")}</pre>
    </article>
  `;
}

function resolveManualScriptAnalysisText(preview) {
  return normalizeNovelStyleScriptText(
    resolveSingleEpisodeAiScriptPayloadText(
      preview?.scriptRawText ||
      preview?.scriptText ||
      preview?.data?.scriptText ||
      "",
    ) ||
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

function truncateSingleEpisodeAiPreviewText(value, maxChars = 0) {
  const text = String(value ?? "");
  if (!maxChars || text.length <= maxChars) {
    return text;
  }
  return `…已截断，仅展示最近 ${maxChars} 字符…\n${text.slice(-maxChars)}`;
}

function renderSingleEpisodeAiLiveTables(preview) {
  const tables = resolveSingleEpisodeAiRenderTables(preview);
  const renderedTables = SINGLE_EPISODE_AI_TABLE_ORDER
    .map((key) => renderSingleEpisodeAiTable(tables[key], key, { previewMode: "live" }))
    .filter(Boolean)
    .join("");
  if (!renderedTables) {
    return "";
  }
  return `
    <div class="single-episode-ai-table-stack live">
      ${renderedTables}
    </div>
  `;
}

function resolveSingleEpisodeAiRenderTables(preview) {
  const candidates = [
    preview?.livePreviewTables,
    preview?.data?.previewTables,
    preview?.previewTables,
    preview?.liveDisplayTables,
    preview?.data?.displayTables,
    preview?.displayTables,
  ];
  return candidates.find((tables) => tables && typeof tables === "object") ?? {};
}

function renderSingleEpisodeAiSentPrompts(preview, options = {}) {
  return "";
}

function renderSingleEpisodeAiPromptBlocks(preview, options = {}) {
  const mode = String(options.mode ?? "loading");
  const promptEntries = resolveSingleEpisodeAiPromptEntries(preview, options);
  if (!promptEntries.length) {
    return "";
  }
  if (mode !== "ready") {
    return "";
  }
  return promptEntries
    .map((entry) => `
      <section class="single-episode-ai-sent-prompt" data-prompt-stage="${escapeAttr(entry.stage)}-prompt">
        <header>
          <strong>${escapeHtml(entry.label)}</strong>
        </header>
        <div class="single-episode-ai-sent-prompt-body">
          <div class="single-episode-ai-sent-block single-episode-ai-sent-block-prompt">
            <p>发送给 DeepSeek 的完整提示词</p>
            <pre>${escapeHtml(entry.promptText)}</pre>
          </div>
        </div>
      </section>
    `)
    .join("");
}

function renderSingleEpisodeAiResponseBlocks(preview, options = {}) {
  const mode = String(options.mode ?? "loading");
  const readyStage = mode === "ready"
    ? resolveSingleEpisodeAiReadyResponseStage(preview)
    : "";
  const steps = Array.isArray(preview?.assetPromptSteps) ? preview.assetPromptSteps : [];
  return steps
    .map((step) => {
      const stage = String(step?.stage ?? "").trim();
      const responseText = String(step?.rawResponseText ?? step?.responseText ?? "").trim();
      if (!responseText) {
        return "";
      }
      if (stage === "shot" && shouldHideSingleEpisodeAiShotRawResponse(responseText)) {
        return "";
      }
      if (mode === "ready" && stage !== readyStage) {
        return "";
      }
      return `
        <section class="single-episode-ai-sent-prompt" data-prompt-stage="${escapeAttr(stage)}-response">
          ${mode === "ready"
            ? `
              <header>
                <strong>${escapeHtml(resolveSingleEpisodeAiPromptStageLabel(stage, "response"))}</strong>
              </header>
            `
            : ""}
          <div class="single-episode-ai-sent-prompt-body">
            <div class="single-episode-ai-sent-block single-episode-ai-sent-block-response">
              ${mode === "ready" ? "<p>DeepSeek 完整返回</p>" : ""}
              ${renderSingleEpisodeAiResponseMarkdown(responseText)}
            </div>
          </div>
        </section>
      `;
    })
    .filter(Boolean)
    .join("");
}

function resolveSingleEpisodeAiReadyResponseStage(preview) {
  const steps = Array.isArray(preview?.assetPromptSteps) ? preview.assetPromptSteps : [];
  const sceneStep = steps.find((step) => String(step?.stage ?? "").trim() === "scene");
  const sceneText = String(sceneStep?.rawResponseText ?? sceneStep?.responseText ?? "").trim();
  return sceneText ? "scene" : "";
}

function resolveSingleEpisodeAiPromptEntries(preview) {
  const steps = Array.isArray(preview?.assetPromptSteps) ? preview.assetPromptSteps : [];
  const entries = steps
    .map((step) => {
      const stage = String(step?.stage ?? "").trim();
      const promptText = String(step?.promptText ?? "").trim();
      if (!stage || !promptText) {
        return null;
      }
      return {
        stage,
        promptText,
        label: resolveSingleEpisodeAiPromptStageLabel(stage, "prompt"),
      };
    })
    .filter(Boolean);
  if (entries.length > 0) {
    return entries;
  }
  const fallbackPromptText = String(preview?.promptText ?? "").trim();
  if (!fallbackPromptText) {
    return [];
  }
  return [{
    stage: "shot",
    promptText: fallbackPromptText,
    label: resolveSingleEpisodeAiPromptStageLabel("shot", "prompt"),
  }];
}

function resolveSingleEpisodeAiPromptStageLabel(stage, kind = "prompt") {
  const stageLabelMap = {
    scene: "场景",
    character: "角色",
    prop: "道具",
    shot: "分镜",
    prompt: "分镜",
  };
  const label = stageLabelMap[String(stage ?? "").trim()] ?? "内容";
  return kind === "response" ? `${label}返回原文` : `发送${label}提示词`;
}

function shouldHideSingleEpisodeAiShotRawResponse(rawResponseText) {
  const trimmed = String(rawResponseText ?? "").trim();
  if (!trimmed) {
    return true;
  }
  try {
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    const parsed = JSON.parse(fenced?.[1] ?? trimmed);
    return Boolean(parsed && typeof parsed === "object" && !Array.isArray(parsed) && Array.isArray(parsed.segments));
  } catch {
    return false;
  }
}

function renderSingleEpisodeAiResponseMarkdown(rawText) {
  const blocks = parseSingleEpisodeAiResponseMarkdownBlocks(rawText);
  if (!blocks.length) {
    return `<pre>${renderSingleEpisodeAiSafeInlineMarkup(rawText)}</pre>`;
  }
  return `
    <div class="single-episode-ai-response-markdown">
      ${blocks.map((block) => {
        if (block.type === "table") {
          return `
            <div class="single-episode-ai-response-table-wrap">
              <table class="single-episode-ai-response-table">
                <thead>
                  <tr>${block.header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr>
                </thead>
                <tbody>
                  ${block.rows.map((row) => `<tr>${row.map((cell) => `<td>${renderSingleEpisodeAiSafeInlineMarkup(cell)}</td>`).join("")}</tr>`).join("")}
                </tbody>
              </table>
            </div>
          `;
        }
        return `<pre>${renderSingleEpisodeAiSafeInlineMarkup(block.text)}</pre>`;
      }).join("")}
    </div>
  `;
}

function renderSingleEpisodeAiSafeInlineMarkup(value) {
  return escapeHtml(String(value ?? ""))
    .replace(/&lt;br\s*\/?&gt;/gi, "<br>");
}

function parseSingleEpisodeAiResponseMarkdownBlocks(rawText) {
  const normalized = extractSingleEpisodeAiResponseMarkdownBody(rawText);
  if (!normalized) {
    return [];
  }
  const lines = normalized.split("\n");
  const blocks = [];
  let textBuffer = [];
  let tableBuffer = [];

  const flushText = () => {
    const text = textBuffer.join("\n").trim();
    if (text) {
      blocks.push({ type: "text", text });
    }
    textBuffer = [];
  };

  const flushTable = () => {
    if (!tableBuffer.length) {
      return;
    }
    const table = parseSingleEpisodeAiResponseMarkdownTable(tableBuffer.join("\n"));
    if (table) {
      blocks.push({ type: "table", ...table });
    } else {
      textBuffer.push(...tableBuffer);
    }
    tableBuffer = [];
  };

  for (const line of lines) {
    if (line.includes("|")) {
      flushText();
      tableBuffer.push(line);
      continue;
    }
    flushTable();
    textBuffer.push(line);
  }

  flushTable();
  flushText();
  return blocks;
}

function extractSingleEpisodeAiResponseMarkdownBody(rawText) {
  const trimmed = String(rawText ?? "").trim();
  if (!trimmed) {
    return "";
  }
  const fenced = trimmed.match(/^```(?:markdown|md|text)?\s*([\s\S]*?)\s*```$/i);
  return String(fenced?.[1] ?? trimmed).replace(/\r\n?/g, "\n");
}

function parseSingleEpisodeAiResponseMarkdownTable(rawText) {
  const lines = String(rawText ?? "")
    .split("\n")
    .map((line) => String(line ?? "").trim())
    .filter((line) => line.includes("|"));
  if (lines.length < 2) {
    return null;
  }
  let header = null;
  const rows = [];
  for (const line of lines) {
    const cells = line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim())
      .filter((cell, index, array) => !(index === array.length - 1 && cell === ""));
    if (cells.length < 2) {
      continue;
    }
    if (cells.every((cell) => /^:?-{3,}:?$/.test(cell) || !cell)) {
      continue;
    }
    if (!header) {
      header = cells;
      continue;
    }
    rows.push(cells);
  }
  return header && rows.length ? { header, rows } : null;
}

function renderSingleEpisodeAiTable(table, key, options = {}) {
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  const title = table?.title ?? AI_PREVIEW_TABLE_TITLES[key] ?? "结果";
  const columns = resolveSingleEpisodeAiTableColumns(table, key);
  if (options.previewMode === "live" && !hasSingleEpisodeAiLiveTableContent(table, key)) {
    return "";
  }
  const tableCardClasses = [
    "single-episode-ai-table-card",
    escapeAttr(key),
    key === "storyboards" && isChapterStoryboardTable(columns) ? "chapter-storyboards" : "",
  ].filter(Boolean).join(" ");
  if (key === "script") {
    return renderSingleEpisodeAiScriptText(table);
  }
  return `
    <article class="${tableCardClasses}">
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
              rows.length
                ? rows.map((row) => renderSingleEpisodeAiTableRow(row, key, columns, options)).join("")
                : options.previewMode === "live"
                  ? ""
                  : `<tr><td colspan="${Math.max(columns.length, 1)}">暂无数据</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function isChapterStoryboardTable(columns = []) {
  const chapterStoryboardColumns = ["分镜剧情", "对话/旁白", "静态图片提示词", "动态视频提示词"];
  return columns.length === chapterStoryboardColumns.length
    && columns.every((column, index) => column === chapterStoryboardColumns[index]);
}

function resolveSingleEpisodeAiTableColumns(table, key) {
  if (key === "storyboards" && Array.isArray(table?.columns) && table.columns.length) {
    return table.columns;
  }
  const fixedColumns = {
    characters: ["角色名称", "角色描述"],
    scenes: ["场景名称", "场景描述"],
    props: ["道具名称", "道具描述"],
    storyboards: ["分镜剧情", "对话/旁白", "静态图片提示词", "动态视频提示词"],
  };
  if (fixedColumns[key]) {
    return fixedColumns[key];
  }
  return Array.isArray(table?.columns) ? table.columns : [];
}

function renderSingleEpisodeAiScriptText(table) {
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  const text = resolveScriptDisplayText(rows
    .map((row) => {
      const scriptContent = resolveSingleEpisodeAiScriptPayloadText(row?.scriptContent);
      const scriptRawContent = resolveSingleEpisodeAiScriptPayloadText(row?.scriptRawContent);
      const dialogue = String(row?.dialogue ?? "").trim();
      const parts = [scriptContent || scriptRawContent];
      if (dialogue && dialogue !== scriptContent && dialogue !== scriptRawContent) {
        parts.push(dialogue);
      }
      return parts.filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n\n"));
  if (!text.trim()) {
    return "";
  }
  return `
    <article class="single-episode-ai-script-text">
      <header>
        <strong>${escapeHtml(table?.title ?? "剧本")}</strong>
        <span>${rows.length} 段</span>
      </header>
      <div>${escapeHtml(text)}</div>
    </article>
  `;
}

function resolveScriptDisplayText(value) {
  return normalizeNovelStyleScriptText(value);
}

function hasSingleEpisodeAiLiveTableContent(table, key) {
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  if (key === "script") {
    return rows.some((row) => [
      resolveSingleEpisodeAiScriptPayloadText(row?.scriptRawContent),
      resolveSingleEpisodeAiScriptPayloadText(row?.scriptContent),
      String(row?.dialogue ?? "").trim(),
    ].some((value) => String(value ?? "").trim()));
  }
  return rows.some((row) =>
    Object.values(row ?? {}).some((value) => String(value ?? "").trim()),
  );
}

function resolveSingleEpisodeAiScriptPayloadText(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return "";
  }
  return extractScriptTextFromStructuredPayload(text) || text;
}

function extractScriptTextFromStructuredPayload(rawText) {
  const trimmed = String(rawText ?? "").trim();
  if (!trimmed || !/^(?:```(?:json)?\s*)?[\[{]/i.test(trimmed)) {
    return "";
  }
  const candidates = [trimmed, extractSingleEpisodeAiResponseMarkdownBody(trimmed)]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const extracted = resolveStructuredScriptTextValue(parsed);
      if (extracted) {
        return extracted;
      }
    } catch {
      const bestEffortText = extractScriptTextFromJsonLikeString(candidate);
      if (bestEffortText) {
        return bestEffortText;
      }
    }
  }
  return "";
}

function extractScriptTextFromJsonLikeString(rawText) {
  const normalized = String(rawText ?? "").trim();
  if (!normalized) {
    return "";
  }
  const keyMatch = normalized.match(/"(?:scriptText|script_text|script|content|text)"\s*:\s*"/i);
  if (!keyMatch || keyMatch.index == null) {
    return "";
  }
  const startIndex = keyMatch.index + keyMatch[0].length;
  return readJsonLikeStringValue(normalized, startIndex);
}

function readJsonLikeStringValue(sourceText, startIndex) {
  const source = String(sourceText ?? "");
  if (!source || startIndex >= source.length) {
    return "";
  }
  let cursor = startIndex;
  let value = "";
  let escaped = false;
  while (cursor < source.length) {
    const char = source[cursor];
    if (escaped) {
      value += decodeJsonLikeEscape(char, source[cursor + 1], source[cursor + 2], source[cursor + 3], source[cursor + 4]);
      if (char === "u" && /^[0-9a-f]{4}$/i.test(source.slice(cursor + 1, cursor + 5))) {
        cursor += 4;
      }
      escaped = false;
      cursor += 1;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      cursor += 1;
      continue;
    }
    if (char === "\"") {
      return value.trim();
    }
    value += char;
    cursor += 1;
  }
  return value.trim();
}

function decodeJsonLikeEscape(char, a, b, c, d) {
  if (char === "n") {
    return "\n";
  }
  if (char === "r") {
    return "\r";
  }
  if (char === "t") {
    return "\t";
  }
  if (char === "b") {
    return "\b";
  }
  if (char === "f") {
    return "\f";
  }
  if (char === "\"" || char === "\\" || char === "/") {
    return char;
  }
  if (char === "u") {
    const hex = `${a ?? ""}${b ?? ""}${c ?? ""}${d ?? ""}`;
    if (/^[0-9a-f]{4}$/i.test(hex)) {
      return String.fromCharCode(Number.parseInt(hex, 16));
    }
  }
  return char ?? "";
}

function resolveStructuredScriptTextValue(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const directCandidates = [
    payload?.scriptText,
    payload?.script_text,
    payload?.script,
    payload?.content,
    payload?.text,
    payload?.data?.scriptText,
    payload?.data?.script_text,
    payload?.data?.script,
    payload?.data?.content,
    payload?.data?.text,
    payload?.result?.scriptText,
    payload?.result?.script_text,
    payload?.result?.script,
    payload?.result?.content,
    payload?.result?.text,
  ];
  for (const candidate of directCandidates) {
    const text = String(candidate ?? "").trim();
    if (text) {
      return text;
    }
  }
  return "";
}

function renderSingleEpisodeAiTableRow(row, key, columns = [], options = {}) {
  const chapterStoryboardColumns = ["分镜剧情", "对话/旁白", "静态图片提示词", "动态视频提示词"];
  const valuesByKey = {
    script: [row.beatNo, row.scriptContent, row.characters, row.sceneHint, row.propHints, row.dialogue],
    scenes: [row.sceneName, row.sceneDescription],
    characters: [row.characterName, row.characterDescription],
    props: [row.propName, row.propDescription],
    storyboards: columns.length === chapterStoryboardColumns.length && columns.every((column, index) => column === chapterStoryboardColumns[index])
      ? [row.plot, row.dialogue, row.displayImagePrompt || row.imagePrompt, row.displayVideoPrompt || row.videoPrompt]
      : [row.plot, row.dialogue, row.displayImagePrompt || row.imagePrompt, row.displayVideoPrompt || row.videoPrompt],
  };
  const values = valuesByKey[key] ?? Object.values(row ?? {});
  return `<tr>${values.map((value) => `<td>${renderSingleEpisodeAiSafeInlineMarkup(resolveSingleEpisodeAiTableCellText(value, options))}</td>`).join("")}</tr>`;
}

function resolveSingleEpisodeAiTableCellText(value, options = {}) {
  const text = String(value ?? "");
  if (options.previewMode !== "live" || text.length <= SINGLE_EPISODE_AI_LIVE_CELL_TEXT_LIMIT) {
    return text;
  }
  return `${text.slice(0, SINGLE_EPISODE_AI_LIVE_CELL_TEXT_LIMIT)}\n…生成中已省略部分内容，完成后显示完整文本…`;
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

function renderScriptConversionSkillControl(ui = {}) {
  const officialSkills = normalizeScriptConversionSkills(ui.scriptConversionOfficialSkills)
    .filter((item) => item.official);
  const officialIds = new Set(officialSkills.map((item) => item.id));
  const personalSkills = normalizeScriptConversionSkills(ui.scriptConversionPersonalSkills)
    .filter((item) => !officialIds.has(item.id));
  const selectedSkillId = String(ui.selectedScriptConversionSkillId ?? "");
  const selectedSkill = [...officialSkills, ...personalSkills]
    .find((item) => item.id === selectedSkillId);
  const summary = selectedSkill?.title
    || (ui.scriptConversionSkillLoading ? "正在加载技能" : "请选择技能");
  return `
    <div class="script-manual-look-control-row">
      ${renderSingleEpisodeTextModelControl(ui)}
      <div class="script-conversion-skill-control">
        <section class="single-episode-look-select" aria-label="小说转剧本技能">
          <div class="single-episode-look-label">
            <span>小说转剧本技能</span>
            <i aria-hidden="true">?</i>
          </div>
          <button
            class="single-episode-look-trigger"
            type="button"
            data-action="open-script-conversion-skill-modal"
            aria-haspopup="dialog"
            aria-expanded="${ui.scriptConversionSkillModalOpen ? "true" : "false"}"
          >
            <span title="${escapeAttr(summary)}">${escapeHtml(summary)}</span>
            ${selectedSkill ? `<small>${formatScriptConversionSkillPrice(selectedSkill.priceCredits)}</small>` : ""}
            <span class="single-episode-look-trigger__icon" aria-hidden="true">${renderUiChevronIcon("down")}</span>
          </button>
        </section>
      </div>
    </div>
  `;
}

function renderScriptConversionSkillModal(ui = {}) {
  const officialSkills = normalizeScriptConversionSkills(ui.scriptConversionOfficialSkills)
    .filter((item) => item.official);
  const officialIds = new Set(officialSkills.map((item) => item.id));
  const personalSkills = normalizeScriptConversionSkills(ui.scriptConversionPersonalSkills)
    .filter((item) => !officialIds.has(item.id));
  const activeTab = ui.scriptConversionSkillTab === "personal" ? "personal" : "official";
  return renderSelectionPickerModal({
    show: ui.isScriptModalOpen === true && ui.scriptModalMode === "manual" && ui.scriptConversionSkillModalOpen === true,
    id: "script-conversion-skill-picker",
    title: "选择小说转剧本技能",
    tabs: [
      { id: "official", label: "官方技能", count: officialSkills.length },
      { id: "personal", label: "个人添加技能", count: personalSkills.length },
    ],
    activeTab,
    items: [
      ...officialSkills.map((item) => ({
        id: item.id,
        group: "official",
        label: item.title,
        description: item.summary,
        meta: formatScriptConversionSkillPrice(item.priceCredits),
      })),
      ...personalSkills.map((item) => ({
        id: item.id,
        group: "personal",
        label: item.title,
        description: item.summary,
        meta: formatScriptConversionSkillPrice(item.priceCredits),
      })),
    ],
    selectedId: String(ui.scriptConversionSkillDraftId ?? ""),
    emptyLabel: activeTab === "personal" ? "暂无个人添加技能" : "暂无官方技能",
    closeAction: "close-script-conversion-skill-modal",
    tabAction: "set-script-conversion-skill-tab",
    selectAction: "select-script-conversion-skill-draft",
    confirmAction: "confirm-script-conversion-skill",
  });
}

function renderAssetImageStyleSkillModal(ui = {}, state = {}) {
  const officialSkills = Array.isArray(ui.episodeBatchOfficialImageStyleSkills)
    ? ui.episodeBatchOfficialImageStyleSkills
    : [];
  const privateSkills = Array.isArray(ui.episodeBatchPrivateImageStyleSkills)
    ? ui.episodeBatchPrivateImageStyleSkills
    : [];
  const activeTab = ui.assetImageStyleSkillTab === "private" ? "private" : "official";
  const projectStyleCode = resolveSelectedEpisodeProjectStyleCode(state, ui)
    || resolveEpisodeProjectStyleCode(state, ui);
  const projectStyle = (Array.isArray(ui.projectStyles) ? ui.projectStyles : [])
    .find((item) => String(item?.code ?? item?.id ?? "") === projectStyleCode)
    ?? ui.projectStyles?.[0]
    ?? null;
  const toPickerItem = (item, group) => ({
    id: String(item?.id ?? ""),
    group,
    label: String(item?.label ?? item?.title ?? "未命名技能"),
    description: "生图风格提示词",
    previewUrl: String(item?.preview ?? item?.coverImageUrl ?? ""),
    meta: Number(item?.priceCredits ?? 0) > 0 ? `${Math.round(Number(item.priceCredits))}积分` : "免费",
  });
  return renderSelectionPickerModal({
    show: ui.assetImageStyleSkillModalOpen === true,
    id: "asset-image-style-skill-picker",
    title: "选择生图风格",
    tabs: [
      { id: "official", label: "官方技能", count: officialSkills.length + 1 },
      { id: "private", label: "私人技能库", count: privateSkills.length },
    ],
    activeTab,
    items: [
      {
        id: "project-style",
        group: "official",
        label: projectStyle?.name ?? "",
        description: "项目默认风格",
        previewUrl: String(projectStyle?.coverImageUrl ?? projectStyle?.cover_image_url ?? ""),
        meta: "免费",
      },
      ...officialSkills.map((item) => toPickerItem(item, "official")),
      ...privateSkills.map((item) => toPickerItem(item, "private")),
    ],
    selectedId: String(ui.assetImageStyleSkillDraftId ?? "project-style"),
    emptyLabel: activeTab === "private" ? "暂无私人生图风格技能" : "暂无官方生图风格技能",
    closeAction: "close-asset-image-style-skill-modal",
    tabAction: "set-asset-image-style-skill-tab",
    selectAction: "select-asset-image-style-skill-draft",
    confirmAction: "confirm-asset-image-style-skill",
  });
}

function renderStoryboardPromptSkillModal(ui = {}) {
  const officialSkills = normalizeStoryboardPromptSkills(ui.storyboardPromptOfficialSkills, "official")
    .filter((item) => item.official);
  const privateSkills = normalizeStoryboardPromptSkills(ui.storyboardPromptPrivateSkills, "private");
  const activeTab = ui.storyboardPromptSkillSourceTab === "private" ? "private" : "official";
  const toPickerItem = (item, group) => ({
    id: item.id,
    group,
    label: item.title,
    description: item.summary || "故事板生成提示词",
    previewUrl: item.preview ? resolveApiUrl(String(item.preview)) : "",
    meta: item.priceCredits > 0 ? `${item.priceCredits}积分` : "免费",
  });
  return renderSelectionPickerModal({
    show: ui.assetGeneratorTarget === "storyboard" &&
      ui.assetGeneratorModal === "storyboard" &&
      ui.storyboardPromptSkillModalOpen === true,
    id: "storyboard-prompt-skill-picker",
    title: "选择故事板提示词",
    tabs: [
      { id: "official", label: "官方技能", count: officialSkills.length },
      { id: "private", label: "私人技能库", count: privateSkills.length },
    ],
    activeTab,
    items: [
      ...officialSkills.map((item) => toPickerItem(item, "official")),
      ...privateSkills.map((item) => toPickerItem(item, "private")),
    ],
    selectedId: String(ui.storyboardPromptSkillDraftId ?? ""),
    emptyLabel: activeTab === "private" ? "暂无私人故事板提示词" : "暂无官方故事板提示词",
    closeAction: "close-storyboard-prompt-skill-modal",
    tabAction: "set-storyboard-prompt-skill-source",
    selectAction: "select-storyboard-prompt-skill-draft",
    confirmAction: "confirm-storyboard-prompt-skill",
  });
}

function normalizeStoryboardPromptSkills(items = [], source = "") {
  return (Array.isArray(items) ? items : [])
    .filter((item) => String(item?.category ?? item?.promptCategory ?? "") === "storyboard")
    .map((item) => ({
      id: String(item?.id ?? ""),
      title: String(item?.title ?? item?.name ?? "未命名提示词"),
      summary: String(item?.summary ?? ""),
      preview:
        String(item?.coverImageUrl ?? "").trim() ||
        String(item?.cover_image_url ?? "").trim() ||
        String(item?.thumbnailUrl ?? "").trim() ||
        String(item?.thumbnail_url ?? "").trim() ||
        String(item?.previewUrl ?? "").trim() ||
        String(item?.preview ?? "").trim() ||
        (item?.coverStorageObjectId ?? item?.cover_storage_object_id
          ? `/api/storage/objects/${encodeURIComponent(String(item.coverStorageObjectId ?? item.cover_storage_object_id))}/content?proxy=1`
          : ""),
      priceCredits: Math.max(0, Math.round(Number(item?.priceCredits ?? item?.price_credits ?? 0) || 0)),
      source,
      official: item?.official === true,
    }))
    .filter((item) => item.id);
}

function resolveEpisodePromptSkillItems(ui = {}) {
  return [
    ...normalizeEpisodePromptSkills(ui.episodePromptOfficialSkills, "official"),
    ...normalizeEpisodePromptSkills(ui.episodePromptPrivateSkills, "private"),
  ];
}

function normalizeScriptConversionSkills(items = []) {
  return Array.isArray(items)
    ? items
        .filter((item) => item && typeof item === "object" && String(item.category ?? "script") === "script")
        .map((item) => ({
          id: String(item.id ?? ""),
          title: String(item.title ?? item.name ?? "未命名技能"),
          summary: String(item.summary ?? ""),
          priceCredits: Math.max(0, Number(item.priceCredits ?? item.price_credits ?? 0) || 0),
          official: item.official === true || item.isOfficial === true || item.is_official === true,
        }))
        .filter((item) => item.id)
    : [];
}

function formatScriptConversionSkillPrice(value) {
  const price = Math.max(0, Number(value) || 0);
  return price === 0 ? "免费" : `${price}积分`;
}

function resolveSelectedScriptConversionSkillCredits(ui = {}) {
  const selectedSkillId = String(ui.selectedScriptConversionSkillId ?? "");
  const selectedSkill = [
    ...normalizeScriptConversionSkills(ui.scriptConversionOfficialSkills),
    ...normalizeScriptConversionSkills(ui.scriptConversionPersonalSkills),
  ].find((item) => item.id === selectedSkillId);
  return Math.max(0, Number(selectedSkill?.priceCredits) || 0);
}

function resolveScriptModalSubmitLabel(ui = {}) {
  const fallback = ui.scriptSubmitLabel ?? "开始分析";
  if (ui.scriptModalMode !== "manual") {
    return fallback;
  }
  const modelCredits = resolveSingleEpisodeModelCreditsByCode(ui, resolveSingleEpisodeTextModelCode(ui));
  if (!modelCredits) {
    return fallback;
  }
  const skillCredits = resolveSelectedScriptConversionSkillCredits(ui);
  return `${fallback} ${formatModelAndSkillCredits(modelCredits, skillCredits)}`;
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
        <span class="single-episode-look-trigger__icon" aria-hidden="true">${renderUiChevronIcon(isOpen ? "up" : "down")}</span>
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
    const fallbackProjectCreatedAt = state?.projectDetail?.project?.createdAt ?? state?.project?.createdAt ?? "";
    const detailEpisodes = state.projectDetail.episodes
      .filter((episode) => String(episode?.title ?? "").trim() !== "画布生成")
      .map((episode) => ({
      id: episode.id,
      title: episode.title,
      sequence: Number(episode.sequence ?? 0),
      status: episode.status === "ready" ? "已定稿" : "未定稿",
      createdAt: episode.createdAt ?? fallbackProjectCreatedAt,
      createdAtMs: getEpisodeCreatedAtValue(episode.createdAt ?? fallbackProjectCreatedAt),
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
          createdAt: state?.projectDetail?.project?.createdAt ?? state?.project?.createdAt ?? "",
          createdAtMs: getEpisodeCreatedAtValue(state?.projectDetail?.project?.createdAt ?? state?.project?.createdAt ?? ""),
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

  const primaryCreatedAt = state?.projectDetail?.project?.createdAt ?? state?.project?.createdAt ?? "";

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

function getEpisodePreviewStoryboardPagination(episodeId, ui) {
  const stored = episodeId ? ui.episodeStoryboardPaginationMap?.[episodeId] : null;
  if (stored && typeof stored === "object") {
    return stored;
  }
  const storyboards = getEpisodePreviewStoryboards(episodeId, ui);
  const pageSize = Math.max(1, Number(ui.storyboardPageSize ?? 10) || 10);
  const total = Array.isArray(storyboards) ? storyboards.length : 0;
  return {
    mode: "local",
    page: Math.max(1, Number(ui.storyboardPage ?? 1) || 1),
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    hasNext: total > pageSize,
  };
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
    return "";
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
      <span class="interior-nav-item__icon" aria-hidden="true">${item.icon}</span>
      <span class="interior-nav-item__copy">
        <strong>${escapeHtml(item.label)}</strong>
      </span>
    </button>
  `;
}

function renderProjectWorkbenchNav(activeInteriorSection, detailState) {
  return `
    <section class="project-workbench-nav-shell" aria-label="项目工作台导航">
      <nav class="project-workbench-nav" aria-label="项目内导航">
        ${INTERIOR_NAV_ITEMS.map((item) =>
          renderInteriorNavItem(item, activeInteriorSection === item.id),
        ).join("")}
      </nav>
    </section>
  `;
}

function renderProjectAssetLibrary({ state, ui, activeAssetTab }) {
  const tab = ASSET_TABS.find((item) => item.id === activeAssetTab) ?? ASSET_TABS[0];
  const isOther = tab.id === "other";
  const mediaType = normalizeProjectOtherAssetMediaType(ui.projectOtherAssetMediaType, "audio");
  const importedAssets = filterAndSortImportedAssets(
    getImportedAssetEntries(state, ui, tab.id, mediaType),
    ui,
  );
  const mediaLabel = resolveProjectOtherAssetMediaLabel(mediaType);
  const filterLabel =
    ui.assetFilterMode === "with-preview"
      ? "有预览"
      : ui.assetFilterMode === "generated"
        ? "已生成"
        : "全部";

  return `
    <section class="project-asset-library ${isOther ? "other-mode-layout" : ""}" aria-label="资产">
      <header class="asset-library-head">
        <div class="asset-library-tabs" role="tablist" aria-label="资产类型">
          ${ASSET_TABS.map((item) => renderProjectAssetTab(item, item.id === tab.id)).join("")}
        </div>
        <div class="asset-library-tools">
          <button class="asset-sort-button" type="button" data-action="toggle-asset-sort-order">
            <span class="asset-toolbar-button__label">${ui.assetSortOrder === "desc" ? "时间倒序" : "时间正序"}</span>
            <span class="asset-toolbar-button__icon" aria-hidden="true">${renderUiChevronIcon("down")}</span>
          </button>
          ${
            isOther
              ? ""
              : `<button class="asset-filter-button" type="button" data-action="toggle-asset-filter-mode"><span class="asset-toolbar-button__label">${escapeHtml(filterLabel)}</span><span class="asset-toolbar-button__icon" aria-hidden="true">${renderUiChevronIcon("down")}</span></button><label class="asset-main-check"><input id="asset-only-main-input" type="checkbox" ${ui.assetOnlyMain ? "checked" : ""} />主体</label>`
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
    <div class="other-media-tabs" role="tablist" aria-label="音频资产媒体类型">
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
  const pagination = paginateProjectAssetLibrary(importedAssets, ui);
  if (!importedAssets.length) {
    return `
      <section class="asset-library-collection empty-layout">
        <div class="asset-library-content-panel">
          ${renderAssetEmptyLibrary(tab)}
          ${renderAssetLibraryPagination(pagination.total, pagination.currentPage, pagination.totalPages, pagination.pageSize)}
        </div>
      </section>
    `;
  }
  const isListMode = ui.assetViewMode === "list";

  return `
    <section class="asset-library-collection ${isListMode ? "list-layout" : "grid-layout"}">
      ${
        isListMode
          ? `<div class="asset-library-actions-column">
              ${renderAssetCreationCards(tab)}
            </div>`
          : ""
      }
      <div class="asset-library-content-panel">
        <div class="asset-library-content-grid ${isListMode ? "list-mode" : "grid-mode"}">
          ${
            isListMode
              ? ""
              : `<div class="asset-library-actions-column">
                  ${renderAssetCreationCards(tab)}
                </div>`
          }
          ${
            pagination.pageItems.length
              ? pagination.pageItems.map((asset) => renderImportedAssetCard(asset, ui)).join("")
              : '<article class="asset-library-empty-card"><strong>还没有已导入资产</strong><span>可以先从左侧导入，完成后会在这里按卡片形式展示。</span></article>'
          }
        </div>
        ${renderAssetLibraryPagination(pagination.total, pagination.currentPage, pagination.totalPages, pagination.pageSize)}
      </div>
    </section>
  `;
}

function renderAssetEmptyLibrary(tab) {
  return `
    <section class="asset-library-empty-showcase">
      <div class="asset-library-empty-showcase-inner">
        ${renderAssetCreationCards(tab)}
      </div>
    </section>
  `;
}

function renderOtherAssetLibrary(mediaType, importedAssets, ui) {
  const label = resolveProjectOtherAssetMediaLabel(mediaType);
  const pagination = paginateProjectAssetLibrary(importedAssets, ui);
  return `
    <section class="other-asset-library">
      <button class="seedance-import-card" type="button" data-action="open-asset-import-modal" data-asset-kind="other">
        <span aria-hidden="true">✦</span>
        导入${label}素材
      </button>
      <div class="asset-library-content-panel">
        <div class="asset-library-content-grid ${ui.assetViewMode === "list" ? "list-mode" : "grid-mode"} other-grid-mode">
          ${
            pagination.pageItems.length
              ? pagination.pageItems.map((asset) => renderOtherImportedAssetCard(asset, mediaType, ui)).join("")
              : `
                <div class="seedance-library-empty">
                  <strong>${label}资源库</strong>
                  <p>暂无${label}，立即上传一个${label}文件吧。</p>
                </div>
              `
          }
        </div>
        ${renderAssetLibraryPagination(pagination.total, pagination.currentPage, pagination.totalPages, pagination.pageSize)}
      </div>
    </section>
  `;
}

const PROJECT_ASSET_LIBRARY_PAGE_SIZE = 27;

function paginateProjectAssetLibrary(items = [], ui = {}) {
  const total = Array.isArray(items) ? items.length : 0;
  const pageSize = PROJECT_ASSET_LIBRARY_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, Number(ui.assetLibraryPage ?? 1) || 1), totalPages);
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  return {
    total,
    pageSize,
    totalPages,
    currentPage,
    pageItems: (Array.isArray(items) ? items : []).slice(start, end),
  };
}

function renderAssetLibraryPagination(totalItems, currentPage, totalPages, pageSize) {
  const pages = buildProjectPageItems(currentPage, totalPages);
  return `
    <footer class="asset-library-pagination" aria-label="素材分页">
      <div class="asset-library-pagination-summary">
        <span>共 ${totalItems} 个素材，每页 ${pageSize} 个</span>
        <span>${currentPage} / ${totalPages}</span>
      </div>
      <div class="asset-library-pagination-controls">
        <button
          class="asset-library-page-button"
          type="button"
          data-action="change-asset-library-page"
          data-page="${currentPage - 1}"
          ${currentPage <= 1 ? "disabled" : ""}
          aria-label="上一页"
        >
          ‹
        </button>
        ${pages.map((page) =>
          page === "ellipsis"
            ? '<span class="asset-library-page-ellipsis">…</span>'
            : `
              <button
                class="asset-library-page-button ${page === currentPage ? "active" : ""}"
                type="button"
                data-action="change-asset-library-page"
                data-page="${page}"
                ${page === currentPage ? 'aria-current="page"' : ""}
              >
                ${page}
              </button>
            `
        ).join("")}
        <button
          class="asset-library-page-button"
          type="button"
          data-action="change-asset-library-page"
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

function renderImportedAssetCard(asset, ui) {
  const preview = resolveImportedAssetPreview(asset);
  const menuId = `asset-menu-${asset.id}`;
  const isMenuOpen = ui.assetCardMenuId === menuId;
  const isHighlighted = isImportedAssetHighlighted(ui, asset.kind, "image", asset.id);
  const rawGenerationStatus = resolveImportedAssetGenerationStatus(asset, ui);
  const shouldShowGenerationState = !isEpisodeSourcedImportedAsset(asset);
  const generationStatus = shouldShowGenerationState ? rawGenerationStatus : "";
  const generationBadge = shouldShowGenerationState ? renderImportedAssetGenerationBadge(generationStatus) : "";
  const generationHint = shouldShowGenerationState ? renderImportedAssetGenerationHint(asset, ui) : "";
  const isGenerated = shouldShowGenerationState && (asset.source === "generated" || asset.assetSource === "generated" || Boolean(generationStatus));
  const isTransferRetrying = generationStatus === "asset_transfer_retry_pending";
  const isGenerating = isImportedAssetGeneratingStatus(generationStatus) && !isTransferRetrying;
  const isFailedGeneration = ["failed", "canceled", "manual_review_required", "result_unknown"].includes(generationStatus);
  const showResolvedPreview = Boolean(preview) && !isGenerating && !isFailedGeneration;
  const generatedPreviewNode = isTransferRetrying
    ? '<div class="asset-generating-placeholder large" aria-hidden="true"><strong>存储超时，正在重试</strong></div>'
    : isGenerating
    ? '<div class="asset-generating-placeholder large" aria-hidden="true"><span></span><span></span><span></span><strong>图片生成中</strong></div>'
    : '<span class="asset-preview-placeholder" aria-hidden="true">✦</span>';
  return `
    <article
      class="imported-asset-card ${escapeHtml(ASSET_LIBRARY_CONFIG[asset.kind]?.importedCardClass ?? "portrait")} ${isHighlighted ? "just-imported" : ""} ${isGenerated ? "generated-task-card" : ""}"
      data-action="edit-imported-asset"
      data-imported-asset-id="${escapeHtml(asset.id)}"
      data-asset-id="${escapeHtml(asset.id)}"
      data-asset-kind="${escapeHtml(asset.kind ?? "")}"
      data-media-type="image"
      tabindex="-1"
    >
      <div class="imported-asset-preview ${isGenerating ? "is-generating" : ""}">
        ${
          showResolvedPreview
            ? `<img src="${escapeHtml(resolveApiUrl(preview))}" alt="${escapeHtml(asset.name)}" loading="lazy" />`
            : generatedPreviewNode
        }
        ${generationBadge}
      </div>
      <div class="imported-asset-meta asset-card-meta-row">
        <div class="asset-card-copy">
          <strong>${escapeHtml(asset.name)}</strong>
          <span>${escapeHtml(asset.description || (asset.source === "generated" ? "已生成资产" : "已导入资产"))}</span>
          ${generationHint}
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
  const audioUrl = resolveImportedAssetAudioUrl(asset);
  const visualPreview =
    mediaType === "audio" ? resolveImportedAssetAudioCoverUrl(asset) : resolveImportedAssetPreview(asset);
  const isAudioPlaying =
    mediaType === "audio" && String(ui.projectAssetPreviewPlayingId ?? "").trim() === String(asset.id ?? "").trim();
  const menuId = `asset-menu-${asset.id}`;
  const isMenuOpen = ui.assetCardMenuId === menuId;
  const isHighlighted = isImportedAssetHighlighted(ui, "other", mediaType, asset.id);
  if (mediaType === "audio") {
    return `
      <article
        class="other-imported-card audio ${isHighlighted ? "just-imported" : ""}"
        data-imported-asset-id="${escapeHtml(asset.id)}"
        tabindex="-1"
      >
        <div class="other-imported-preview audio-preview ${visualPreview ? "has-cover" : ""}">
          ${visualPreview ? `<img src="${escapeHtml(resolveApiUrl(visualPreview))}" alt="${escapeHtml(asset.name)}" loading="lazy" />` : '<span class="project-audio-avatar" aria-hidden="true"></span>'}
          <div class="project-audio-card-actions">
            <button
              class="project-audio-play-button"
              type="button"
              data-action="preview-project-audio-asset"
              data-asset-id="${escapeAttr(asset.id)}"
              data-audio-url="${escapeAttr(resolveApiUrl(audioUrl))}"
              aria-label="${isAudioPlaying ? "停止播放" : "播放音频"}"
            >${
              isAudioPlaying
                ? '<span class="project-audio-icon project-audio-icon-pause" aria-hidden="true"><span></span><span></span></span>'
                : '<span class="project-audio-icon project-audio-icon-play" aria-hidden="true">▷</span>'
            }</button>
          </div>
        </div>
        <div class="asset-card-meta-row">
          <div class="asset-card-copy">
            <strong>${escapeHtml(asset.name)}</strong>
            <span>${escapeHtml(asset.description || (audioUrl ? "点击播放音频" : "已导入音频"))}</span>
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
  return `
    <article
      class="other-imported-card ${mediaType} ${isHighlighted ? "just-imported" : ""}"
      ${mediaType === "image" ? 'data-action="edit-imported-asset"' : ""}
      data-imported-asset-id="${escapeHtml(asset.id)}"
      data-asset-id="${escapeHtml(asset.id)}"
      data-asset-kind="other"
      data-media-type="${escapeHtml(mediaType)}"
      tabindex="-1"
    >
      <div class="other-imported-preview">
        ${visualPreview ? `<img src="${escapeHtml(resolveApiUrl(visualPreview))}" alt="${escapeHtml(asset.name)}" loading="lazy" />` : '<span class="asset-preview-placeholder" aria-hidden="true">✦</span>'}
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
  const activeTab = "local";
  const assetKind = ui.assetImportModal ?? "character";
  const otherMediaType = normalizeProjectOtherAssetMediaType(ui.projectOtherAssetMediaType, "audio");
  const assetLabel = getAssetModalLabel(
    assetKind,
    otherMediaType,
  );
  const isEpisodeWorkbenchLibraryModal =
    ui.projectPanelMode === "episode-workbench" &&
    assetKind !== "other" &&
    ["character", "scene", "prop"].includes(assetKind);

  if (isEpisodeWorkbenchLibraryModal) {
    return renderEpisodeWorkbenchAssetImportModal(ui, assetKind);
  }

  if (assetKind === "other" && otherMediaType === "audio") {
    return renderAudioAssetImportModal(ui);
  }

  return `
    <section class="asset-import-backdrop modal-backdrop" role="dialog" aria-modal="true" aria-label="import-asset-dialog">
      <div class="asset-import-modal ${assetKind === "character" ? "character-import-flow" : ""} ${assetKind === "other" ? "other-import-flow" : ""}">
        <button class="asset-modal-close" type="button" data-action="close-asset-import-modal" aria-label="关闭">×</button>
        <header class="asset-import-header">
          <h2>导入${escapeHtml(assetLabel)}</h2>
        </header>
        ${renderAssetImportBody(ui, activeTab, assetKind)}
      </div>
    </section>
  `;
}

function renderAudioAssetImportModal(ui) {
  const draft = ui.audioAssetImportDraft ?? {};
  const isEditing = Boolean(String(draft.assetId ?? "").trim());
  const name = String(draft.name ?? "").slice(0, 20);
  const audioFileName = String(draft.audioFileName ?? "").trim();
  const audioUploading = draft.audioUploading === true;
  const exampleImageUploading = draft.exampleImageUploading === true;
  const audioPreviewUrl = resolvePreferredPreviewUrl(
    draft.audioPreviewUrl,
    draft.audioUpload?.publicUrl,
    draft.audioUpload?.previewUrl,
  );
  const exampleImageUrl = resolvePreferredPreviewUrl(
    draft.exampleImagePreview,
    draft.exampleImageUrl,
    draft.exampleImageSourceUrl,
  );
  const canSave = Boolean(name.trim() && draft.audioUpload && !audioUploading && !exampleImageUploading);

  return `
    <section class="asset-import-backdrop modal-backdrop" role="dialog" aria-modal="true" aria-label="audio-import-dialog">
      <div class="asset-import-modal audio-import-modal">
        <button class="asset-modal-close" type="button" data-action="close-asset-import-modal" aria-label="关闭">×</button>
        <div class="audio-import-form">
          <label class="audio-import-field">
            <span>配音员名称 <em>*</em></span>
            <div class="audio-import-input-wrap">
              <input
                id="audio-import-name-input"
                type="text"
                maxlength="20"
                value="${escapeAttr(name)}"
                placeholder="请填写配音员名称"
              />
              <em>${[...name].length} / 20</em>
            </div>
          </label>

          <div class="audio-import-field">
            <span>配音文件 <em>*</em></span>
            <button class="audio-import-upload-button ${audioPreviewUrl ? "has-audio" : ""}" type="button" data-action="trigger-audio-import-audio-file" ${disabled(audioUploading)}>
              <i aria-hidden="true">${audioUploading ? "↻" : "⇪"}</i>
              <strong>${audioUploading ? "上传中..." : audioPreviewUrl ? "重新上传配音" : "上传配音"}</strong>
              <span>${audioPreviewUrl ? "已选择配音文件，可重新上传" : "支持 MP3、WAV 等常见音频格式"}</span>
            </button>
            <input class="audio-import-hidden-input" type="file" accept="audio/*" data-action="select-audio-import-audio-file" />
            ${
              audioPreviewUrl
                ? `
                  <div class="audio-import-player-shell">
                    <audio
                      class="audio-import-player"
                      controls
                      preload="metadata"
                      src="${escapeAttr(resolveApiUrl(audioPreviewUrl))}"
                    ></audio>
                  </div>
                `
                : ""
            }
            ${audioFileName ? `<p class="audio-import-file-name">${escapeHtml(audioFileName)}</p>` : ""}
          </div>

          <div class="audio-import-field">
            <span>配音员示例图（非必填，仅用于分辨配音）</span>
            <button class="audio-import-image-button ${exampleImageUrl ? "has-image" : ""}" type="button" data-action="trigger-audio-import-example-image" ${disabled(exampleImageUploading)}>
              ${
                exampleImageUploading
                  ? `<i aria-hidden="true">↑</i><strong>上传中...</strong>`
                  :
                exampleImageUrl
                  ? `<img src="${escapeAttr(resolveApiUrl(exampleImageUrl))}" alt="配音员示例图" loading="lazy" />`
                  : `<i aria-hidden="true">↑</i><strong>上传图片</strong>`
              }
            </button>
            <input class="audio-import-hidden-input" type="file" accept="image/*" data-action="select-audio-import-example-image" />
          </div>

          <button class="audio-import-save-button ${canSave ? "is-ready" : "is-blocked"}" type="button" data-action="confirm-audio-asset-import">${isEditing ? "保存修改" : "保存"}</button>
        </div>
      </div>
    </section>
  `;
}

function renderEpisodeWorkbenchAssetImportModal(ui, assetKind) {
  const assetTypeTabs = [
    { id: "character", label: "角色" },
    { id: "scene", label: "场景" },
    { id: "prop", label: "道具" },
  ];
  const scopeTabs = [
    { id: "project", label: "项目资产库" },
    { id: "team", label: "团队资产库" },
    { id: "official", label: "官方资产库" },
  ];
  const activeScope = ["team", "official"].includes(ui.assetImportModalSource)
    ? ui.assetImportModalSource
    : "project";
  const assets = normalizeEpisodeWorkbenchImportAssets(ui.assetImportOfficialAssets ?? []);
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
          <div class="episode-asset-library-title-row">
            <nav class="episode-asset-library-scope-tabs" aria-label="资产库范围" role="tablist">
              ${scopeTabs
                .map(
                  (tab) => `
                    <button
                      class="${tab.id === activeScope ? "active" : ""}"
                      type="button"
                      role="tab"
                      aria-selected="${tab.id === activeScope ? "true" : "false"}"
                      data-action="set-asset-import-scope"
                      data-asset-scope="${escapeAttr(tab.id)}"
                    >
                      ${escapeHtml(tab.label)}
                    </button>
                  `,
                )
                .join("")}
            </nav>
          </div>
          <nav class="episode-asset-library-tabs" aria-label="资产类型">
            ${assetTypeTabs
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
                      ${Array.from({ length: totalPages }, (_, index) => index + 1)
                        .map(
                          (page) =>
                            page === currentPage
                              ? `<em>${page}</em>`
                              : `<button type="button" data-action="change-asset-import-page" data-page="${page}">${page}</button>`,
                        )
                        .join("")}
                      <button type="button" data-action="change-asset-import-page" data-page="${currentPage + 1}" ${disabled(currentPage >= totalPages)}>下一页</button>
                    </div>
                  </div>
                  <button type="button" class="asset-import-confirm-button" data-action="confirm-asset-import" ${disabled(!selection.length)}>确认</button>
                </footer>
              `
              : `
                <div class="episode-asset-library-empty">
                  <span class="asset-import-lock" aria-hidden="true">✦</span>
                  <strong>暂无${escapeHtml(scopeTabs.find((tab) => tab.id === activeScope)?.label ?? "资产库")}的${escapeHtml(getAssetLabel(assetKind))}</strong>
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
      if (isTemporaryEpisodeUploadAsset(asset)) {
        continue;
      }
      const id = String(asset?.id ?? asset?.assetId ?? "").trim();
      if (!id || seen.has(id)) {
        continue;
      }
      seen.add(id);
      const { generationResult } = resolveImportedAssetGenerationSnapshot(asset);
      assets.push({
        id,
        name: asset.name ?? asset.label ?? asset.assetKey ?? "未命名资产",
        preview: resolvePreferredPreviewUrl(
          generationResult?.version?.previewUrl,
          generationResult?.version?.metadata?.previewUrl,
          generationResult?.version?.metadata?.fixedImageUrl,
          generationResult?.result?.imageUrl,
          generationResult?.result?.previewUrl,
          generationResult?.fixedImages?.[0]?.previewUrl,
          generationResult?.fixedImages?.[0]?.url,
          generationResult?.fixedImages?.[0]?.src,
          asset.latestVersion?.metadata?.fixedImageUrl,
          asset.latestVersion?.metadata?.previewUrl,
          asset.previewUrl,
          asset.preview,
          asset.fixedImageUrl,
          asset.latestVersion?.previewUrl,
        ),
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

function filterTemporaryEpisodeUploadAssets(assets = []) {
  return (Array.isArray(assets) ? assets : []).filter((asset) => !isTemporaryEpisodeUploadAsset(asset));
}

function isTemporaryEpisodeUploadAsset(asset) {
  const metadata = asset?.latestVersion?.metadata && typeof asset.latestVersion.metadata === "object"
    ? asset.latestVersion.metadata
    : asset?.metadata && typeof asset.metadata === "object"
      ? asset.metadata
      : {};
  const assetKey = String(asset?.assetKey ?? asset?.key ?? asset?.label ?? asset?.name ?? "").trim().toLowerCase();
  const purpose = String(metadata?.purpose ?? asset?.purpose ?? "").trim().toLowerCase();
  const targetType = String(metadata?.targetType ?? asset?.targetType ?? "").trim().toLowerCase();
  return (
    assetKey.startsWith("upload:") ||
    (targetType === "episode" && purpose.startsWith("episode-attachments/"))
  );
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
  const mediaType = normalizeProjectOtherAssetMediaType(ui.projectOtherAssetMediaType, "audio");

  return `
    <section class="asset-import-local">
      <button
        class="asset-import-dropzone ${escapeHtml(config.dropzoneMode ?? "")}"
        type="button"
        data-action="pick-asset-import-files"
        data-dropzone="asset-import"
      >
        <input
          class="asset-import-file-input"
          type="file"
          accept="${escapeHtml(getAssetImportAccept(assetKind, mediaType))}"
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
  const label = resolveProjectOtherAssetMediaLabel(mediaType);
  return `
    <section class="other-asset-empty">
      <button class="seedance-import-card" type="button">
        <span aria-hidden="true">✦</span>
        导入${label}素材
      </button>
      <div class="seedance-library-empty">
        <strong>${label}资源库</strong>
        <p>暂无${label}，立即上传一个${label}文件吧！</p>
      </div>
    </section>
  `;
}

function renderAssetImportReview(ui, assetKind) {
  const label = getAssetModalLabel(
    assetKind,
    normalizeProjectOtherAssetMediaType(ui.projectOtherAssetMediaType, "audio"),
  );
  const selection = ui.assetImportSelection ?? [];
  const config = ASSET_LIBRARY_CONFIG[assetKind] ?? ASSET_LIBRARY_CONFIG.character;
  const isTeamLibraryUpload = ui.activeNavTab === "library" && ui.assetImportModalSource === "team";

  return `
    <section class="asset-import-review">
      <p class="asset-import-success-copy">${isTeamLibraryUpload ? "本次已选择" : "本次上传成功"} ${ui.assetImportDrafts.length} 个，请确认以下${escapeHtml(label)}名称:</p>
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
        <span>${escapeHtml(isTeamLibraryUpload ? "确认后将批量上传至团队资产库。" : config.reviewFootnote)}</span>
        <div class="asset-import-review-actions">
          ${isTeamLibraryUpload ? "" : '<button type="button" class="asset-import-secondary-button" data-action="confirm-asset-import">导入并保存为主体</button>'}
          <button type="button" class="asset-import-confirm-button" data-action="confirm-asset-import" ${disabled(!selection.length)}>${isTeamLibraryUpload ? "确认上传" : "确认导入"}</button>
        </div>
      </footer>
    </section>
  `;
}

function getImportedAssetEntries(state, ui, assetKind, mediaType = "audio") {
  const preferWorkbenchAssets = ui.projectPanelMode === "episode-workbench";
  if (preferWorkbenchAssets) {
    if (assetKind === "other") {
      return ui.importedAssets?.other?.[mediaType] ?? [];
    } else {
      return filterTemporaryEpisodeUploadAssets(ui.importedAssets?.[assetKind] ?? []);
    }
  }
  const detailAssets = state?.projectDetail?.assetsByType;
  if (detailAssets) {
    if (assetKind === "other") {
      if (mediaType === "audio") {
        const audioAssets = [
          ...(detailAssets.other?.audio ?? []),
          ...((detailAssets.other?.video ?? []).filter((asset) => isAudioLibraryAssetRecord(asset))),
        ];
        return mapDetailAssets(audioAssets, "other", ui, mediaType);
      }
      if (mediaType === "video") {
        return mapDetailAssets(
          (detailAssets.other?.video ?? []).filter((asset) => !isAudioLibraryAssetRecord(asset)),
          "other",
          ui,
          mediaType,
        );
      }
      return mapDetailAssets(detailAssets.other?.image ?? [], "other", ui, mediaType);
    }
    return mapDetailAssets(filterTemporaryEpisodeUploadAssets(detailAssets[assetKind] ?? []), assetKind, ui, mediaType);
  }
  if (assetKind === "other") {
    return ui.importedAssets?.other?.[mediaType] ?? [];
  }
  return filterTemporaryEpisodeUploadAssets(ui.importedAssets?.[assetKind] ?? []);
}

function mapDetailAssets(assets, kind, ui = {}, mediaType = "image") {
  const importedBucket = kind === "other"
    ? ui.importedAssets?.other?.[normalizeProjectOtherAssetMediaType(mediaType, "audio")] ?? []
    : ui.importedAssets?.[kind] ?? [];
  const importedById = new Map(
    importedBucket
      .map((asset) => [String(asset?.id ?? asset?.assetId ?? "").trim(), asset])
      .filter(([id]) => id),
  );
  return assets.map((asset) => {
    const assetId = String(asset?.id ?? asset?.assetId ?? "").trim();
    const localAsset = importedById.get(assetId) ?? null;
    const localAssetIsEpisode = isEpisodeSourcedImportedAsset(localAsset);
    const displaySource = localAssetIsEpisode
      ? "episode"
      : asset.latestVersion?.metadata?.source ?? localAsset?.source ?? "import";
    const { generationResult, generationStatus, generationTaskId } = resolveImportedAssetGenerationSnapshot(
      asset,
      localAsset,
    );
    const preview = resolvePreferredPreviewUrl(
      generationResult?.version?.previewUrl,
      generationResult?.version?.metadata?.previewUrl,
      generationResult?.version?.metadata?.fixedImageUrl,
      generationResult?.result?.imageUrl,
      generationResult?.result?.previewUrl,
      generationResult?.fixedImages?.[0]?.previewUrl,
      generationResult?.fixedImages?.[0]?.url,
      generationResult?.fixedImages?.[0]?.src,
      asset.previewUrl,
      asset.latestVersion?.metadata?.fixedImageUrl,
      asset.latestVersion?.previewUrl,
      asset.latestVersion?.metadata?.previewUrl,
      localAsset?.preview,
      localAsset?.previewUrl,
      localAsset?.fixedImageUrl,
    );
    return {
      id: asset.id,
      name: asset.label ?? asset.assetKey ?? localAsset?.name ?? "未命名资产",
      preview,
      previewUrl: preview,
      fixedImageUrl: resolvePreferredPreviewUrl(
        asset.latestVersion?.metadata?.fixedImageUrl,
        asset.previewUrl,
        localAsset?.fixedImageUrl,
        localAsset?.previewUrl,
      ),
      description: asset.latestVersion?.metadata?.description ?? localAsset?.description ?? asset.assetKey ?? "",
      kind,
      isMain: Boolean(asset.latestVersion?.metadata?.isMain ?? localAsset?.isMain),
      source: displaySource,
      assetSource: localAssetIsEpisode ? "episode" : asset.latestVersion?.metadata?.source ?? localAsset?.assetSource ?? "import",
      updatedAt: asset.updatedAt ?? asset.latestVersion?.createdAt ?? localAsset?.updatedAt ?? asset.createdAt ?? null,
      mimeType: asset.latestVersion?.metadata?.mimeType ?? asset.latestVersion?.mimeType ?? localAsset?.mimeType ?? "",
      sourceUrl: asset.latestVersion?.metadata?.sourceUrl ?? asset.previewUrl ?? localAsset?.sourceUrl ?? "",
      audioUrl: resolveImportedAssetAudioUrl(asset) || localAsset?.audioUrl || "",
      latestVersion: asset.latestVersion ?? localAsset?.latestVersion ?? null,
      generationStatus,
      generationTaskId,
      generationResult,
    };
  });
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

function isImportedAssetHighlighted(ui, assetKind, mediaType, assetId) {
  const highlightedIds = ui.assetLibraryHighlightAssetIds ?? [];
  if (!highlightedIds.includes(assetId)) {
    return false;
  }
  if ((ui.assetLibraryHighlightKind ?? null) !== assetKind) {
    return false;
  }
  if (assetKind === "other" && normalizeProjectOtherAssetMediaType(ui.assetLibraryHighlightMediaType, "audio") !== mediaType) {
    return false;
  }
  return true;
}

function getAssetModalLabel(assetKind, mediaType = "audio") {
  if (assetKind === "other") {
    if (mediaType === "image") {
      return "图片主体";
    }
    if (mediaType === "video") {
      return "视频主体";
    }
    return "音频素材";
  }
  return getAssetLabel(assetKind);
}

function getAssetLabel(assetKind) {
  return (
    {
      character: "角色",
      scene: "场景",
      prop: "道具",
      other: "音频",
    }[assetKind] ?? "资产"
  );
}

function getAssetImportAccept(assetKind, otherMediaType = "audio") {
  if (assetKind === "other") {
    if (otherMediaType === "image") {
      return "image/*";
    }
    if (otherMediaType === "video") {
      return "video/*";
    }
    return "audio/*";
  }
  return "image/*";
}

function getAssetImportHint(assetKind, mediaType = "audio") {
  if (assetKind === "other") {
    if (mediaType === "image") {
      return "上传图片主体后，可在图片分镜中作为统一参考主体使用";
    }
    if (mediaType === "video") {
      return "上传视频主体后，可在视频分镜中作为统一参考主体使用";
    }
    return "上传音频后，可在配音与音频参考流程中直接复用。";
  }
  return ASSET_LIBRARY_CONFIG[assetKind]?.importHint ?? ASSET_LIBRARY_CONFIG.character.importHint;
}

function getAssetImportNote(assetKind, mediaType = "audio") {
  if (assetKind === "other") {
    if (mediaType === "image") {
      return "支持上传单张图片主体，上传完成后可在确认页修改名称并导入。";
    }
    if (mediaType === "video") {
      return "支持上传视频主体素材，上传完成后可在确认页修改名称并导入。";
    }
    return "支持上传 MP3、WAV、M4A、AAC，上传完成后可在确认页修改名称并导入。";
  }
  return ASSET_LIBRARY_CONFIG[assetKind]?.importNote ?? ASSET_LIBRARY_CONFIG.character.importNote;
}

function getAssetDropzoneTitle(assetKind, mediaType = "audio") {
  if (assetKind === "other") {
    if (mediaType === "image") {
      return "点击或直接拖拽图片主体上传";
    }
    if (mediaType === "video") {
      return "点击或直接拖拽视频主体上传";
    }
    return "点击或直接拖拽音频上传";
  }
  return ASSET_LIBRARY_CONFIG[assetKind]?.dropzoneTitle ?? ASSET_LIBRARY_CONFIG.character.dropzoneTitle;
}

function getAssetDropzoneCopy(assetKind, mediaType = "audio") {
  if (assetKind === "other") {
    if (mediaType === "image") {
      return "支持 PNG、JPG 等图片格式，确认后会展示在当前图片主体资源库";
    }
    if (mediaType === "video") {
      return "支持 MP4、MOV 等视频格式，确认后会展示在当前视频主体资源库";
    }
    return "支持 MP3、WAV、M4A、AAC，确认后会展示在当前音频资源库";
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

function resolveAssetGeneratorImageModels(ui = {}) {
  const configuredModels = Array.isArray(ui.episodeGenerationConfig?.models)
    ? ui.episodeGenerationConfig.models
    : [];
  const imageModels = configuredModels
    .filter((model) => {
      if (model?.disabled === true) {
        return false;
      }
      const mediaType = String(model?.mediaType ?? model?.media_type ?? model?.mediaKind ?? "").trim().toLowerCase();
      if (mediaType) {
        if (mediaType !== "image") {
          return false;
        }
      }
      const modelKind = String(model?.modelKind ?? model?.model_kind ?? model?.uiConfig?.modelKind ?? "").trim().toLowerCase();
      if (modelKind) {
        return modelKind === "image.reference_image";
      }
      const supportedModes = [
        ...(Array.isArray(model?.supportedModes) ? model.supportedModes : []),
        ...(Array.isArray(model?.taskModes) ? model.taskModes : []),
      ];
      return supportedModes.some((mode) => {
        const normalizedMode = String(mode ?? "").trim().toLowerCase();
        if (/video|audio/.test(normalizedMode)) {
          return false;
        }
        return /reference|multi_reference|image_to_image|image\.edit|image_edit/.test(normalizedMode);
      });
    })
    .map((model) => ({
      raw: model,
      code: String(model?.modelCode ?? model?.id ?? "").trim(),
      label: String(model?.modelLabel ?? model?.label ?? model?.name ?? model?.modelCode ?? "").trim(),
    }))
    .filter((model) => model.code);
  if (imageModels.length || configuredModels.length) {
    return imageModels;
  }
  const fallbackCode = String(ui.assetGeneratorModelCode ?? ui.assetGeneratorModel ?? "").trim();
  return fallbackCode
    ? [{ raw: null, code: fallbackCode, label: fallbackCode }]
    : [];
}

function resolveAssetGeneratorModelConfig(ui = {}) {
  const models = resolveAssetGeneratorImageModels(ui);
  const defaultCode = String(ui.episodeGenerationConfig?.defaultImageModelCode ?? "").trim();
  const requestedCode = String(ui.assetGeneratorModelCode ?? "").trim();
  const selected =
    models.find((model) => model.code === requestedCode) ??
    models.find((model) => model.code === defaultCode) ??
    models[0] ??
    null;
  const raw = selected?.raw ?? {};
  const defaultParams = raw?.defaultParams && typeof raw.defaultParams === "object" ? raw.defaultParams : {};
  const aspectRatioOptions = dedupeAssetGeneratorOptionPairs([
    ...assetGeneratorOptionPairsFromSource(raw?.supportedRatios),
    ...assetGeneratorOptionPairsFromSource(raw?.ratios),
    ...assetGeneratorParameterOptionPairs(raw, ["aspectRatio", "imageAspectRatio", "ratio"]),
  ]);
  const resolutionOptions = dedupeAssetGeneratorOptionPairs([
    ...assetGeneratorOptionPairsFromSource(raw?.supportedQuality),
    ...assetGeneratorOptionPairsFromSource(raw?.supportedResolutions),
    ...assetGeneratorOptionPairsFromSource(raw?.qualities),
    ...assetGeneratorOptionPairsFromSource(raw?.resolutions),
    ...assetGeneratorParameterOptionPairs(raw, ["quality", "resolution", "imageResolution"]),
  ]);
  const resolution = resolveAssetGeneratorSelectedOption({
    candidates: [ui.assetGeneratorResolution, defaultParams.quality, defaultParams.resolution],
    options: resolutionOptions,
    fallback: "2K",
  });
  const aspectRatio = resolveAssetGeneratorSelectedOption({
    candidates: [ui.assetGeneratorAspectRatio, defaultParams.aspectRatio],
    options: aspectRatioOptions,
    fallback: "16:9",
  });
  const countVisible = assetGeneratorParameterVisibility(raw, "count");
  return {
    models,
    selected,
    modelCode: selected?.code ?? "",
    modelLabel: selected?.label || String(ui.assetGeneratorModel ?? "").trim() || "未加载模型",
    resolution,
    resolutionOptions: resolutionOptions.length ? resolutionOptions : [[resolution, resolution || "默认"]],
    aspectRatio,
    aspectRatioOptions: aspectRatioOptions.length ? aspectRatioOptions : [[aspectRatio, aspectRatio || "默认"]],
    count: Number(defaultParams.count ?? ui.assetGeneratorCount ?? 1) || 1,
    countVisible,
    credits: resolveAssetGeneratorModelCredits(raw),
    creditBalance: resolveDisplayedCreditBalance(ui, {}),
  };
}

function assetGeneratorParameterVisibility(model = {}, key = "") {
  const schemas = [
    model?.parameterSchema,
    model?.parametersSchema,
    model?.parameter_schema,
  ].filter((schema) => schema && typeof schema === "object" && !Array.isArray(schema));
  for (const schema of schemas) {
    const parameter = schema?.[key];
    if (parameter && typeof parameter === "object" && !Array.isArray(parameter)) {
      return parameter.visible !== false;
    }
  }
  return true;
}

function assetGeneratorParameterOptionPairs(model = {}, keys = []) {
  const schemas = [
    model?.parameterSchema,
    model?.parametersSchema,
    model?.parameter_schema,
  ].filter((schema) => schema && typeof schema === "object" && !Array.isArray(schema));
  return schemas.flatMap((schema) =>
    keys.flatMap((key) => assetGeneratorOptionPairsFromSource(schema?.[key])),
  );
}

function assetGeneratorOptionPairsFromSource(source) {
  if (source === undefined || source === null || source === "") {
    return [];
  }
  const rawOptions = Array.isArray(source)
    ? source
    : Array.isArray(source?.options)
      ? source.options
      : Array.isArray(source?.enum)
        ? source.enum
        : [source];
  return rawOptions
    .map((item) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const value = String(item.value ?? item.providerValue ?? item.id ?? item.code ?? item.label ?? item.name ?? "").trim();
        const label = String(item.label ?? item.name ?? item.title ?? value).trim();
        return value ? [value, label || value] : null;
      }
      const value = String(item ?? "").trim();
      return value ? [value, value] : null;
    })
    .filter(Boolean);
}

function dedupeAssetGeneratorOptionPairs(pairs = []) {
  const seen = new Set();
  return pairs.filter(([value]) => {
    const key = String(value ?? "").trim();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function resolveAssetGeneratorSelectedOption({ candidates = [], options = [], fallback = "" } = {}) {
  const optionValues = new Set(options.map(([value]) => String(value ?? "").trim()).filter(Boolean));
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (!value) {
      continue;
    }
    if (!optionValues.size || optionValues.has(value)) {
      return value;
    }
  }
  return String(options[0]?.[0] ?? fallback ?? "").trim();
}

function resolveAssetGeneratorModelCredits(model = {}) {
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
      return Math.round(value);
    }
  }
  return null;
}

function renderAssetGeneratorModal(ui) {
  const assetKind = ui.assetGeneratorModal ?? "character";
  const isStoryboardGenerator = assetKind === "storyboard";
  const tab = ASSET_TABS.find((item) => item.id === assetKind) ?? ASSET_TABS[0];
  const label = isStoryboardGenerator ? "故事板" : tab.label;
  const isEditing = ui.assetGeneratorMode === "edit";
  const name = ui.assetGeneratorName ?? "";
  const editingAsset = ui.assetGeneratorEditingAsset ?? null;
  const description = ui.assetGeneratorPrompt ?? "";
  const taskSummary = resolveAssetGeneratorTaskSummary(editingAsset);
  const showTaskOverview =
    Boolean(editingAsset) &&
    (editingAsset?.source === "generated" ||
      editingAsset?.assetSource === "generated" ||
      Boolean(taskSummary.status) ||
      Boolean(taskSummary.taskId) ||
      Boolean(taskSummary.previewUrl));
  const completedTaskOverview = ["completed", "succeeded"].includes(taskSummary.status);
  const previewUrl = resolvePreferredPreviewUrl(
    ui.assetGeneratorPreviewUrl,
    ...(!showTaskOverview || completedTaskOverview
      ? [
          editingAsset?.fixedImageUrl,
          editingAsset?.preview,
          editingAsset?.previewUrl,
          editingAsset?.latestVersion?.metadata?.fixedImageUrl,
          editingAsset?.latestVersion?.previewUrl,
          editingAsset?.latestVersion?.metadata?.previewUrl,
        ]
      : []),
  );
  const generatorConfig = resolveAssetGeneratorModelConfig(ui);
  const hasModelOptions = generatorConfig.models.length > 0;
  const selectedGeneratorModel = generatorConfig.selected?.raw ?? null;
  const generatorSettings = buildCanvasImageSettingsState(selectedGeneratorModel, {
    ...(ui.assetGeneratorParameterValues ?? {}),
    imageResolution: generatorConfig.resolution,
    quality: generatorConfig.resolution,
    resolution: generatorConfig.resolution,
    imageAspectRatio: generatorConfig.aspectRatio,
    aspectRatio: generatorConfig.aspectRatio,
  });
  const generatorStyleOptions = (Array.isArray(ui.projectStyles) ? ui.projectStyles : [])
    .filter((style) => style && typeof style === "object" && style.status !== "disabled")
    .map((style) => ({
      code: String(style.code ?? style.id ?? "").trim(),
      name: String(style.name ?? style.label ?? "").trim(),
      coverImageUrl: String(style.coverImageUrl ?? style.cover_image_url ?? "").trim(),
    }))
    .filter((style) => style.code && style.name);
  const selectedGeneratorStyle = generatorStyleOptions.find(
    (style) => style.code === String(ui.assetGeneratorStyleCode ?? "").trim(),
  ) ?? generatorStyleOptions[0] ?? null;
  const imageStyleSkills = [
    ...(Array.isArray(ui.episodeBatchOfficialImageStyleSkills) ? ui.episodeBatchOfficialImageStyleSkills : []),
    ...(Array.isArray(ui.episodeBatchPrivateImageStyleSkills) ? ui.episodeBatchPrivateImageStyleSkills : []),
  ];
  const selectedImageStyleSkillId = String(ui.assetImageStyleSkillId ?? "project-style");
  const selectedImageStyleSkill = imageStyleSkills.find(
    (skill) => String(skill?.id ?? "") === selectedImageStyleSkillId,
  ) ?? null;
  const selectedImageStyleLabel = selectedImageStyleSkill?.label
    ?? selectedImageStyleSkill?.title
    ?? selectedGeneratorStyle?.name
    ?? "动画";
  const selectedImageStylePreview = String(
    selectedImageStyleSkill?.preview
      ?? selectedImageStyleSkill?.coverImageUrl
      ?? selectedImageStyleSkill?.cover_image_url
      ?? selectedGeneratorStyle?.coverImageUrl
      ?? "",
  ).trim();
  const selectedImageStyleCredits = Math.max(0, Math.round(Number(selectedImageStyleSkill?.priceCredits) || 0));
  const storyboardPromptSkills = [
    ...normalizeStoryboardPromptSkills(ui.storyboardPromptOfficialSkills, "official"),
    ...normalizeStoryboardPromptSkills(ui.storyboardPromptPrivateSkills, "private"),
  ];
  const selectedStoryboardPromptSkillId = String(ui.selectedStoryboardPromptSkillId ?? "").trim();
  const selectedStoryboardPromptSkill = storyboardPromptSkills.find(
    (skill) => skill.id === selectedStoryboardPromptSkillId,
  ) ?? null;
  const storyboardPromptSkillLabel = selectedStoryboardPromptSkill?.title ?? "故事板提示词";
  const storyboardPromptSkillPreview = String(selectedStoryboardPromptSkill?.preview ?? "").trim();
  const storyboardPromptSkillCredits = Math.max(0, Math.round(Number(selectedStoryboardPromptSkill?.priceCredits) || 0));
  const generatorSkillCredits = isStoryboardGenerator
    ? selectedImageStyleCredits + storyboardPromptSkillCredits
    : selectedImageStyleCredits;
  const generatorCredits = (generatorConfig.credits ?? 90) + generatorSkillCredits;
  const generatorCostLabel = isStoryboardGenerator && generatorSkillCredits > 0
    ? `${generatorConfig.credits ?? 90} + ${generatorSkillCredits}积分`
    : String(generatorCredits);
  if (!isEditing) {
    const storyboardTaskOverview = isStoryboardGenerator
      ? renderStoryboardGeneratorTaskOverview(ui)
      : "";
    return `
      <section class="asset-generator-backdrop" role="dialog" aria-modal="true" aria-label="生成${escapeHtml(label)}">
        <div class="asset-generator-modal asset-generator-modal-create ${storyboardTaskOverview ? "has-task-overview" : ""}">
          <button class="asset-modal-close" type="button" data-action="close-asset-generator-modal" aria-label="关闭">×</button>
          <aside class="asset-generator-form ${isStoryboardGenerator ? "storyboard-generator-form" : ""}">
            <h2>生成${escapeHtml(label)}</h2>
            ${isStoryboardGenerator ? `
              <div class="asset-generator-storyboard-context" data-storyboard-id="${escapeAttr(String(ui.assetGeneratorStoryboardId ?? ""))}">
                <span>当前分镜</span>
                <strong>${escapeHtml(name || "未命名分镜")}</strong>
              </div>
            ` : ""}
            ${isStoryboardGenerator ? "" : `
              <label class="asset-generator-field">
                <span>${escapeHtml(label)}名称 <b>*</b></span>
                <div class="asset-generator-name-row">
                  <input id="asset-generator-name-input" type="text" value="${escapeHtml(name)}" placeholder="请输入${escapeHtml(label)}名称" />
                </div>
                <em class="asset-generator-name-count">${[...name].length}/50</em>
              </label>
            `}
            ${renderAssetGeneratorComposer({
              description,
              previewUrl: isStoryboardGenerator ? "" : previewUrl,
              referenceItems: isStoryboardGenerator
                ? [
                    ...(ui.assetGeneratorStoryboardReferences ?? []),
                    ...(ui.assetGeneratorStoryboardUploadReferences ?? []),
                  ]
                : [],
              modelCode: generatorConfig.modelCode,
              modelLabel: generatorConfig.modelLabel,
              modelOptions: hasModelOptions
                ? generatorConfig.models.map((model) => [model.code, model.label || model.code])
                : [["", "未加载后台模型配置"]],
              openGenerationSelectMenu: ui.openGenerationSelectMenu,
              generatorSettings,
              styleCode: isStoryboardGenerator ? selectedGeneratorStyle?.code ?? "" : "",
              styleLabel: isStoryboardGenerator ? selectedGeneratorStyle?.name ?? "" : "",
              styleOptions: isStoryboardGenerator ? generatorStyleOptions : [],
              imageStyleSkillId: isStoryboardGenerator ? selectedImageStyleSkillId : "",
              imageStyleSkillLabel: isStoryboardGenerator ? selectedImageStyleLabel : "",
              imageStyleSkillPreview: isStoryboardGenerator ? selectedImageStylePreview : "",
               imageStyleSkillModalOpen: isStoryboardGenerator && ui.assetImageStyleSkillModalOpen === true,
               promptSkillLabel: isStoryboardGenerator ? storyboardPromptSkillLabel : "",
               promptSkillPreview: isStoryboardGenerator ? storyboardPromptSkillPreview : "",
               promptSkillModalOpen: isStoryboardGenerator && ui.storyboardPromptSkillModalOpen === true,
              action: "submit-asset-generator",
              credits: generatorCredits,
              costLabel: generatorCostLabel,
              isSubmitting: ui.assetGeneratorSubmitting === true,
              referenceInputId: isStoryboardGenerator
                ? "asset-generator-storyboard-reference-input"
                : "asset-generator-reference-input",
            })}
          </aside>
          ${storyboardTaskOverview || '<section class="asset-generator-preview"></section>'}
        </div>
      </section>
    `;
  }
  const placeholderArt = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 720">
      <rect width="960" height="720" rx="36" fill="#20222b"/>
      <rect x="74" y="74" width="812" height="572" rx="28" fill="#2d303b" stroke="rgba(255,255,255,0.08)" stroke-width="2" stroke-dasharray="16 16"/>
      <path d="M332 364h296" stroke="rgba(255,255,255,0.42)" stroke-width="18" stroke-linecap="round"/>
      <path d="M480 216v296" stroke="rgba(255,255,255,0.42)" stroke-width="18" stroke-linecap="round"/>
      <text x="480" y="558" text-anchor="middle" fill="rgba(255,255,255,0.52)" font-family="Segoe UI, Microsoft YaHei, sans-serif" font-size="34" font-weight="700">点击上传图片</text>
    </svg>
  `)}`;
  const taskOverview = showTaskOverview
    ? renderAssetGeneratorTaskOverview(editingAsset, previewUrl, placeholderArt, {
      isSubmitting: ui.assetGeneratorSubmitting === true,
      modelCode: generatorConfig.modelCode,
      modelLabel: generatorConfig.modelLabel,
      modelOptions: generatorConfig.models.map((model) => [model.code, model.label || model.code]),
      openGenerationSelectMenu: ui.openGenerationSelectMenu,
      generatorSettings,
      credits: generatorConfig.credits ?? 90,
      currentPrompt: description,
      retryPreviewUrl: ui.assetGeneratorRetryPreviewUrl,
      currentPreviewUrl: previewUrl,
    })
    : "";

  return `
    <section class="asset-generator-backdrop" role="dialog" aria-modal="true" aria-label="编辑${escapeHtml(label)}">
      <div class="asset-generator-modal asset-generator-modal-edit ${showTaskOverview ? "has-task-overview" : ""}">
        <button class="asset-modal-close" type="button" data-action="close-asset-generator-modal" aria-label="关闭">×</button>
        <aside class="asset-generator-form">
          <h2>编辑${escapeHtml(label)}</h2>
          <label class="asset-generator-field">
            <span>名称 <b>*</b></span>
            <div class="asset-generator-name-row">
              <input id="asset-generator-name-input" type="text" value="${escapeHtml(name)}" placeholder="请输入名称" />
            </div>
            <em class="asset-generator-name-count">${[...name].length}/50</em>
          </label>
          <label class="asset-generator-field asset-generator-description-field">
            <span>描述</span>
            <textarea id="asset-generator-prompt-input" data-max-length="460" placeholder="请输入描述">${escapeHtml(description)}</textarea>
            <em class="asset-generator-prompt-count">${[...description].length}/460</em>
          </label>
          <div class="asset-generator-image-field">
            <span>参考图</span>
            <label class="asset-generator-image-picker ${previewUrl ? "has-preview" : "is-empty"}" for="asset-generator-image-input">
              <img class="asset-generator-image-preview" src="${escapeHtml(previewUrl ? resolveApiUrl(previewUrl) : placeholderArt)}" alt="${escapeHtml(name || "图片预览")}" onerror="this.hidden=true;const picker=this.closest('.asset-generator-image-picker');picker&&picker.classList.remove('has-preview');picker&&picker.classList.add('is-empty');const overlay=picker&&picker.querySelector('.asset-generator-image-overlay');const title=overlay&&overlay.querySelector('strong');const note=overlay&&overlay.querySelector('span');if(title)title.textContent='点击上传';if(note)note.textContent='上传一张新的参考图';" />
              <div class="asset-generator-image-overlay">
                <strong>${previewUrl ? "点击更换" : "点击上传"}</strong>
                <span>${previewUrl ? "替换当前参考图" : "上传一张新的参考图"}</span>
              </div>
            </label>
            <input id="asset-generator-image-input" class="asset-generator-image-input" type="file" accept="image/*" data-action="upload-asset-generator-image" />
          </div>
          <div class="asset-generator-footer">
            <button type="button" data-action="submit-asset-generator">${isEditing ? "保存" : "生成"}</button>
          </div>
        </aside>
        ${taskOverview}
      </div>
    </section>
  `;
}

function renderAssetGeneratorUploadModal() {
  return `
    <section class="asset-generator-upload-backdrop" role="alertdialog" aria-modal="true" aria-label="图片上传中" aria-live="assertive">
      <div class="asset-generator-upload-modal">
        <span class="asset-generator-upload-spinner" aria-hidden="true"></span>
        <strong>图片上传中</strong>
        <p>正在处理图片，请稍候...</p>
      </div>
    </section>
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

function renderAssetGeneratorSpecSelect(id, label, options = [], selectedValue = "", openMenu = "") {
  const normalizedOptions = dedupeAssetGeneratorOptionPairs(options);
  const selected = String(selectedValue ?? "").trim();
  const optionList = normalizedOptions.length ? normalizedOptions : [[selected, selected || "默认"]];
  const selectedOption = optionList.find(([value]) => String(value ?? "").trim() === selected) ?? optionList[0] ?? ["", "默认"];
  const menuKey = id.includes("aspect") ? "aspectRatio" : "resolution";
  const action = id.includes("aspect") ? "select-asset-generator-aspect-ratio" : "select-asset-generator-resolution";
  return renderAssetGeneratorMenuSelect({
    id,
    menuKey,
    label,
    selectedValue: selected,
    selectedLabel: selectedOption[1] || selectedOption[0] || "默认",
    options: optionList,
    openMenu,
    action,
  });
}

function renderAssetGeneratorMenuSelect({
  id,
  menuKey,
  label,
  selectedValue = "",
  selectedLabel = "",
  options = [],
  openMenu = "",
  action,
  disabled = false,
} = {}) {
  const normalizedOptions = dedupeAssetGeneratorOptionPairs(options);
  const isOpen = openMenu === menuKey;
  const selected = String(selectedValue ?? "").trim();
  return `
    <div class="asset-generator-menu-select ${isOpen ? "is-open" : ""}">
      <button
        id="${escapeAttr(id)}"
        class="asset-generator-menu-trigger"
        type="button"
        data-action="toggle-asset-generator-menu"
        data-menu-key="${escapeAttr(menuKey)}"
        aria-label="${escapeAttr(label)}"
        aria-haspopup="listbox"
        aria-expanded="${isOpen ? "true" : "false"}"
        ${disabled ? "disabled" : ""}
      >
        <span>${escapeHtml(selectedLabel || selected || "默认")}</span>
        <span class="asset-generator-menu-chevron" aria-hidden="true">${renderUiChevronIcon("down")}</span>
      </button>
      ${isOpen && !disabled ? `
        <div class="asset-generator-menu-popover" role="listbox" aria-label="${escapeAttr(label)}">
          ${normalizedOptions
        .map(([value, optionLabel]) => {
          const normalizedValue = String(value ?? "").trim();
          return `
            <button
              class="${normalizedValue === selected ? "is-selected" : ""}"
              type="button"
              role="option"
              aria-selected="${normalizedValue === selected ? "true" : "false"}"
              data-action="${escapeAttr(action)}"
              data-value="${escapeAttr(normalizedValue)}"
            >
              ${escapeHtml(optionLabel || normalizedValue || "默认")}
            </button>
          `;
        })
        .join("")}
        </div>
      ` : ""}
    </div>
  `;
}

function renderAssetGeneratorComposer({
  description = "",
  previewUrl = "",
  referenceItems = [],
  modelCode = "",
  modelLabel = "",
  modelOptions = [],
  openGenerationSelectMenu = null,
  generatorSettings = {},
  styleCode = "",
  styleLabel = "",
  styleOptions = [],
  imageStyleSkillId = "project-style",
  imageStyleSkillLabel = "",
  imageStyleSkillPreview = "",
  imageStyleSkillModalOpen = false,
  promptSkillLabel = "",
  promptSkillPreview = "",
  promptSkillModalOpen = false,
  action = "submit-asset-generator",
  credits = 90,
  costLabel = null,
  isSubmitting = false,
  promptInputId = "asset-generator-prompt-input",
  referenceInputId = "asset-generator-reference-input",
} = {}) {
  const isStoryboardGenerator = [
    "asset-generator-storyboard-reference-input",
    "asset-generator-storyboard-retry-reference-input",
  ].includes(referenceInputId);
  return `
    <div class="asset-generator-prompt asset-generator-composer ${isStoryboardGenerator ? "without-heading" : ""}">
      ${isStoryboardGenerator ? "" : "<span>输入提示词</span>"}
      <div class="asset-generator-prompt-shell">
        <div class="asset-generator-reference-row">
          ${renderAssetGeneratorReferenceUpload(previewUrl, referenceInputId)}
          ${renderAssetGeneratorReferenceItems(referenceItems)}
        </div>
        ${isStoryboardGenerator
          ? `<div class="episode-prompt-editor-host asset-generator-prompt-editor-host" data-storyboard-generator-prompt-editor>
              <textarea id="${escapeAttr(promptInputId)}" data-asset-generator-prompt-input data-max-length="5000" placeholder="请输入您的生图要求，输入 @ 引用图片">${escapeHtml(description)}</textarea>
            </div>`
          : `<textarea id="${escapeAttr(promptInputId)}" data-asset-generator-prompt-input data-max-length="5000" placeholder="请输入您的生图要求">${escapeHtml(description)}</textarea>`}
        <small class="asset-generator-prompt-count">${[...description].length}/5000</small>
        <footer class="asset-generator-composer-footer episode-replica-prompt-footer">
          <div class="asset-generator-composer-controls episode-replica-prompt-selects">
            ${renderGenerationControlMenu({
              field: "model",
              label: modelLabel,
              openMenu: openGenerationSelectMenu,
              options: modelOptions?.length ? modelOptions : [[modelCode, modelLabel || modelCode || "未加载模型"]],
              action: "select-asset-generator-model",
              selectedValue: modelCode,
              scope: "asset-generator",
            })}
            ${renderGenerationSettingsControl({
              kind: "image",
              openMenu: openGenerationSelectMenu,
              settings: generatorSettings,
              scope: "asset-generator",
            })}
            ${isStoryboardGenerator
              ? `
                <span class="episode-replica-control-wrap episode-image-style-skill-wrap">
                  <button
                    class="episode-replica-control episode-image-style-skill-trigger"
                    type="button"
                    data-action="open-asset-image-style-skill-modal"
                    aria-haspopup="dialog"
                    aria-expanded="${imageStyleSkillModalOpen ? "true" : "false"}"
                    aria-label="生图风格：${escapeAttr(imageStyleSkillLabel || "生图风格")}"
                  >
                    ${imageStyleSkillPreview
                      ? `<img class="episode-image-style-skill-thumb" src="${escapeAttr(resolveApiUrl(imageStyleSkillPreview))}" alt="" />`
                      : `<span class="episode-image-style-skill-thumb fallback" aria-hidden="true">${escapeHtml([...(imageStyleSkillLabel || "生图风格")][0] ?? "风")}</span>`}
                    <span class="episode-image-style-skill-name">${escapeHtml(imageStyleSkillLabel || "生图风格")}</span>
                  </button>
                </span>
                <span class="episode-replica-control-wrap episode-image-style-skill-wrap">
                  <button
                    class="episode-replica-control episode-image-style-skill-trigger"
                    type="button"
                    data-action="open-storyboard-prompt-skill-modal"
                    aria-haspopup="dialog"
                    aria-expanded="${promptSkillModalOpen ? "true" : "false"}"
                    aria-label="故事板提示词：${escapeAttr(promptSkillLabel || "故事板提示词")}"
                  >
                    ${promptSkillPreview
                      ? `<img class="episode-image-style-skill-thumb" src="${escapeAttr(resolveApiUrl(promptSkillPreview))}" alt="" />`
                      : `<span class="episode-image-style-skill-thumb fallback" aria-hidden="true">${escapeHtml([...(promptSkillLabel || "故事板提示词")][0] ?? "故")}</span>`}
                    <span class="episode-image-style-skill-name">${escapeHtml(promptSkillLabel || "故事板提示词")}</span>
                  </button>
                </span>`
              : ""}
          </div>
          ${renderGenerationSubmitButton({ action, cost: credits, costLabel, busy: isSubmitting })}
        </footer>
      </div>
    </div>
  `;
}

function renderAssetGeneratorReferenceItems(items = []) {
  const visibleItems = items
    .map((item, index) => ({
      id: String(item?.id ?? item?.assetId ?? item?.url ?? item?.previewUrl ?? item?.preview ?? item?.src ?? ""),
      name: `图${index + 1}`,
      url: item?.url ?? item?.previewUrl ?? item?.preview ?? item?.src ?? "",
    }))
    .filter((item) => item.url);
  if (!visibleItems.length) {
    return "";
  }
  return `
    <span class="asset-generator-reference-items" aria-label="当前分镜素材图片">
      ${visibleItems.map((item) => `
        <span class="asset-generator-reference-item" title="${escapeAttr(item.name)}">
          <img src="${escapeAttr(resolveApiUrl(item.url))}" alt="${escapeAttr(item.name)}" />
          <span class="episode-replica-ref-index">${escapeHtml(item.name)}</span>
          <button class="asset-generator-reference-remove" type="button" data-action="remove-storyboard-generator-reference" data-reference-id="${escapeAttr(item.id)}" aria-label="删除${escapeAttr(item.name)}" title="删除${escapeAttr(item.name)}">×</button>
        </span>
      `).join("")}
    </span>
  `;
}

function renderAssetGeneratorReferenceUpload(previewUrl = "", inputId = "asset-generator-reference-input") {
  const hasPreview = Boolean(previewUrl);
  const isTaskSnapshot = inputId.includes("retry-reference-input");
  const allowsMultiple = [
    "asset-generator-storyboard-reference-input",
    "asset-generator-storyboard-retry-reference-input",
  ].includes(inputId);
  return `
    <div class="asset-generator-reference-upload ${hasPreview ? "has-preview" : ""}">
      <button class="asset-generator-reference-button" type="button" data-action="pick-asset-generator-reference-image" data-reference-input-id="${escapeAttr(inputId)}" aria-label="${hasPreview ? (isTaskSnapshot ? "更换提示词图" : "更换参考图") : (isTaskSnapshot ? "上传提示词图" : "上传参考图")}">
        ${hasPreview
          ? isTaskSnapshot
            ? `<img src="${escapeHtml(resolveApiUrl(previewUrl))}" alt="提示词图预览" onerror="this.hidden=true;const button=this.closest('.asset-generator-reference-button');button&&button.setAttribute('aria-label','提示词图不可用');this.nextElementSibling.hidden=false;" /><strong hidden>提示词图不可用</strong>`
            : `<img src="${escapeHtml(resolveApiUrl(previewUrl))}" alt="参考图预览" onerror="this.hidden=true;const upload=this.closest('.asset-generator-reference-upload');upload&&upload.classList.remove('has-preview');const button=this.closest('.asset-generator-reference-button');button&&button.setAttribute('aria-label','上传参考图');this.nextElementSibling.hidden=false;this.nextElementSibling.nextElementSibling.hidden=false;" /><span aria-hidden="true" hidden>+</span><strong hidden>图片</strong>`
          : `<span aria-hidden="true">+</span><strong>图片</strong>`}
      </button>
      <input id="${escapeAttr(inputId)}" class="asset-generator-reference-input" type="file" accept="image/*" data-action="upload-asset-generator-image" ${allowsMultiple ? "multiple" : ""} hidden />
    </div>
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

function renderCommunityPage({ ui, session }) {
  const posts = Array.isArray(ui.communityPosts) ? ui.communityPosts : [];
  const features = Array.isArray(ui.communityFeatures) ? ui.communityFeatures : [];
  const sortedPosts = sortCommunityPosts(posts);
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(sortedPosts.length / pageSize));
  const currentPage = Math.min(Math.max(Number(ui.communityPostPage || 1), 1), pageCount);
  const visiblePosts = sortedPosts.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const sortedFeatures = [...features]
    .sort((left, right) => Number(right.votes || 0) - Number(left.votes || 0))
    .slice(0, 10);
  const totalVotes = features.reduce((sum, feature) => sum + Number(feature.votes || 0), 0);
  const postRows = visiblePosts.length
    ? visiblePosts.map((post) => renderCommunityPost(post, session, ui)).join("")
    : `<article class="community-empty"><strong>还没有社区反馈</strong><span>提交你的第一个问题或想法，管理员会在后台看到。</span></article>`;
  const pagination = sortedPosts.length > pageSize
    ? `
      <div class="community-pagination">
        <button type="button" data-action="set-community-post-page" data-page="${currentPage - 1}" ${currentPage <= 1 ? "disabled" : ""}>上一页</button>
        <span>${currentPage} / ${pageCount}</span>
        <button type="button" data-action="set-community-post-page" data-page="${currentPage + 1}" ${currentPage >= pageCount ? "disabled" : ""}>下一页</button>
      </div>
    `
    : "";
  const featureRows = sortedFeatures.length
    ? sortedFeatures.map((feature) => renderCommunityFeature(feature, session)).join("")
    : `<article class="community-empty"><strong>暂无功能投票</strong><span>暂时还没有功能建议。</span></article>`;
  const composerMenu = `
    <div class="community-fab-menu" role="menu" aria-label="社区快捷菜单">
      <button type="button" role="menuitem" data-action="open-community-composer" data-mode="post">
        <strong>社区发布</strong>
        <span>分享心得、反馈问题或记录生成体验</span>
      </button>
      <button type="button" role="menuitem" data-action="open-community-composer" data-mode="feature">
        <strong>功能投票</strong>
        <span>提出希望优先开发的新功能</span>
      </button>
      <button type="button" role="menuitem" data-action="open-community-my-posts">
        <strong>我的帖子</strong>
        <span>查看、修改或删除自己发布的内容</span>
      </button>
    </div>
  `;
  const composerModal = renderCommunityComposerModal(ui.communityComposerMode);
  const myPostsModal = renderCommunityMyPostsModal({ ui, session, posts });

  return `
    <section class="community-page" aria-label="灵曦社区">
      <div class="community-overview" aria-label="社区概览">
        <div>
          <span>共创社区</span>
          <strong>把生成体验、问题反馈和功能优先级集中到一处。</strong>
        </div>
        <dl>
          <div><dt>发布</dt><dd>${sortedPosts.length}</dd></div>
          <div><dt>建议</dt><dd>${features.length}</dd></div>
          <div><dt>投票</dt><dd>${totalVotes}</dd></div>
        </dl>
      </div>
      <section class="community-layout">
        <section class="community-column community-feed-column">
          <div class="community-section-head"><div><span>Feedback</span><h2>社区发布</h2><p>分享视频提示词心得，或记录 Bug、体验卡点、内容生成异常。</p></div></div>
          <div class="community-feed">${postRows}</div>
          ${pagination}
        </section>
        <aside class="community-column community-feature-column">
          <div class="community-section-head"><div><span>Roadmap</span><h2>功能投票</h2><p>自发提出想让我们优先开发的功能，也可以给已有建议投票。</p></div></div>
          <div class="community-feature-list">${featureRows}</div>
        </aside>
      </section>
      <div class="community-fab-wrap">
        ${composerMenu}
        <button class="community-fab" type="button" aria-label="打开社区快捷菜单">+</button>
      </div>
      ${composerModal}
      ${myPostsModal}
    </section>
  `;
}

function renderPersonalMediaLibraryPage({ ui = {}, session = {} }) {
  const summary = ui.personalMediaLibrarySummary ?? {};
  const rows = Array.isArray(ui.personalMediaLibraryRows) ? ui.personalMediaLibraryRows : [];
  const pagination = ui.personalMediaLibraryMeta ?? { page: 1, pageSize: 12, total: rows.length, totalPages: 1 };
  const loading = ui.personalMediaLibraryLoading === true;
  const error = String(ui.personalMediaLibraryError ?? "").trim();
  const keyword = String(ui.personalMediaLibraryKeywordDraft ?? ui.personalMediaLibraryKeyword ?? "");
  const media = String(ui.personalMediaLibraryMediaFilter ?? "all");
  const range = String(ui.personalMediaLibraryRangeFilter ?? "all");
  const accountLabel = resolveStatusbarAccountLabel(session);
  const page = Math.max(1, Number(pagination.page ?? 1));
  const totalPages = Math.max(1, Number(pagination.totalPages ?? 1));
  return `
    <section class="community-page personal-media-page" aria-label="素材库">
      <section class="community-hero personal-media-hero">
        <div>
          <p class="community-eyebrow">My Media Library</p>
          <h1>素材库</h1>
          <p>集中查看你自己上传或生成的图片与视频素材，和管理端列表类似，但只展示当前账号的个人内容。</p>
        </div>
        <aside class="community-hero-panel">
          <small>当前账号</small>
          <strong>${escapeHtml(accountLabel)}</strong>
          <span>${escapeHtml(String(summary.total ?? rows.length))} 项个人素材</span>
        </aside>
      </section>

      <section class="personal-media-summary">
        ${renderPersonalMediaStatCard("全部素材", String(summary.total ?? 0), "图片与视频总量")}
        ${renderPersonalMediaStatCard("图片", String(summary.imageCount ?? 0), formatBytes(summary.imageBytes))}
        ${renderPersonalMediaStatCard("视频", String(summary.videoCount ?? 0), formatBytes(summary.videoBytes))}
      </section>

      <section class="personal-media-panel">
        <div class="personal-media-toolbar">
          <label class="personal-media-search">
            <span>搜索</span>
            <input type="search" value="${escapeAttr(keyword)}" placeholder="搜索文件名、项目名、来源动作" data-action="search-personal-media-library" />
          </label>
          <div class="personal-media-chip-group" role="tablist" aria-label="媒体类型">
            ${renderPersonalMediaFilterButton("all", "全部", media, "set-personal-media-filter", "media")}
            ${renderPersonalMediaFilterButton("image", "图片", media, "set-personal-media-filter", "media")}
            ${renderPersonalMediaFilterButton("video", "视频", media, "set-personal-media-filter", "media")}
          </div>
          <div class="personal-media-chip-group" role="tablist" aria-label="时间范围">
            ${renderPersonalMediaFilterButton("all", "全部时间", range, "set-personal-media-filter", "range")}
            ${renderPersonalMediaFilterButton("day", "今日", range, "set-personal-media-filter", "range")}
            ${renderPersonalMediaFilterButton("month", "本月", range, "set-personal-media-filter", "range")}
          </div>
        </div>

        ${error ? `<div class="personal-media-feedback error" role="alert">素材库加载失败：${escapeHtml(error)}</div>` : ""}
        ${loading ? `<div class="personal-media-feedback loading">正在加载你的素材库...</div>` : ""}

        <div class="personal-media-list">
          ${
            rows.length
              ? rows.map((row) => renderPersonalMediaRow(row)).join("")
              : !loading
              ? `<article class="community-empty"><strong>还没有个人素材</strong><span>你上传或生成的图片、视频会在这里自动汇总。</span></article>`
              : ""
          }
        </div>
        ${rows.length ? `
          <div class="personal-media-pagination">
            <button type="button" data-action="change-personal-media-page" data-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>上一页</button>
            <span>第 ${page} / ${totalPages} 页</span>
            <button type="button" data-action="change-personal-media-page" data-page="${page + 1}" ${page >= totalPages ? "disabled" : ""}>下一页</button>
          </div>
        ` : ""}
      </section>
    </section>
  `;
}

function renderPersonalMediaStatCard(label, value, hint) {
  return `
    <article class="personal-media-stat-card">
      <small>${escapeHtml(label)}</small>
      <strong>${escapeHtml(String(value ?? "0"))}</strong>
      <span>${escapeHtml(String(hint ?? "-"))}</span>
    </article>
  `;
}

function renderPersonalMediaFilterButton(value, label, currentValue, action, field) {
  const active = value === currentValue;
  return `
    <button
      class="personal-media-chip${active ? " is-active" : ""}"
      type="button"
      role="tab"
      aria-selected="${active ? "true" : "false"}"
      data-action="${escapeAttr(action)}"
      data-field="${escapeAttr(field)}"
      data-value="${escapeAttr(value)}"
    >${escapeHtml(label)}</button>
  `;
}

function renderPersonalMediaRow(row = {}) {
  const previewUrl = resolvePreferredPreviewUrl(row.previewUrl, row.sourceUrl, row.downloadUrl);
  const mediaKind = String(row.mediaKind ?? "").trim() === "video" ? "video" : "image";
  const fileName = String(row.fileName ?? row.objectKey ?? "未命名素材").trim() || "未命名素材";
  const projectName = String(row.projectName ?? "").trim();
  const sourceAction = String(row.sourceAction ?? "").trim();
  const createdAt = formatLedgerDate(row.createdAt);
  const sizeLabel = formatBytes(row.sizeBytes);
  return `
    <article class="personal-media-row">
      <div class="personal-media-preview ${mediaKind}">
        ${
          previewUrl
            ? mediaKind === "video"
              ? `<video src="${escapeAttr(resolveApiUrl(previewUrl))}" muted playsinline preload="metadata"></video><i>▶</i>`
              : `<img src="${escapeAttr(resolveApiUrl(previewUrl))}" alt="${escapeAttr(fileName)}" />`
            : `<span>${mediaKind === "video" ? "视频" : "图片"}</span>`
        }
      </div>
      <div class="personal-media-meta">
        <div class="personal-media-title-line">
          <strong>${escapeHtml(fileName)}</strong>
          <span class="personal-media-kind ${mediaKind}">${mediaKind === "video" ? "视频" : "图片"}</span>
        </div>
        <div class="personal-media-subline">
          <span>${escapeHtml(projectName || "未关联项目")}</span>
          <span>${escapeHtml(sourceAction || "个人素材")}</span>
          <span>${escapeHtml(sizeLabel)}</span>
          <time>${escapeHtml(createdAt)}</time>
        </div>
      </div>
      <div class="personal-media-actions">
        ${previewUrl ? `<a href="${escapeAttr(resolveApiUrl(previewUrl))}" target="_blank" rel="noreferrer">查看</a>` : ""}
        ${row.downloadUrl ? `<a href="${escapeAttr(resolveApiUrl(row.downloadUrl))}" target="_blank" rel="noreferrer">下载</a>` : ""}
      </div>
    </article>
  `;
}

function sortCommunityPosts(posts = []) {
  return [...posts].sort((left, right) => getCommunityPostSortTime(right) - getCommunityPostSortTime(left));
}

function getCommunityPostSortTime(post = {}) {
  const commentTimes = (Array.isArray(post.comments) ? post.comments : []).flatMap((comment) => [
    communityTimeValue(comment.createdAt),
    ...(Array.isArray(comment.replies) ? comment.replies.map((reply) => communityTimeValue(reply.createdAt)) : []),
  ]);
  const latestCommentTime = Math.max(0, ...commentTimes);
  return latestCommentTime || communityTimeValue(post.createdAt);
}

function communityTimeValue(value) {
  const time = Date.parse(String(value ?? ""));
  return Number.isFinite(time) ? time : 0;
}

function renderCommunityComposerModal(mode) {
  if (mode === "feature") {
    return `
      <div class="community-modal" role="dialog" aria-modal="true" aria-labelledby="community-composer-title">
        <div class="community-modal-panel">
          <div class="community-modal-head">
            <div>
              <p class="community-eyebrow">Feature Vote</p>
              <h2 id="community-composer-title">发起功能投票</h2>
              <span>写清楚这个功能能节省什么时间，其他创作者可以继续投票。</span>
            </div>
            <button class="community-modal-close" type="button" data-action="close-community-composer" aria-label="关闭">×</button>
          </div>
          <form class="community-form community-dialog-form compact" data-community-feature-form>
            <label><span>功能名称</span><input name="title" maxlength="80" placeholder="例如：批量生成角色三视图" required autofocus /></label>
            <label><span>为什么需要</span><textarea name="content" rows="5" maxlength="500" placeholder="一句话说明它能帮你节省什么时间。" required></textarea></label>
            <button class="community-primary" type="button" data-action="submit-community-feature">发起投票</button>
          </form>
        </div>
      </div>
    `;
  }
  if (mode === "post") {
    return `
      <div class="community-modal" role="dialog" aria-modal="true" aria-labelledby="community-composer-title">
        <div class="community-modal-panel">
          <div class="community-modal-head">
            <div>
              <p class="community-eyebrow">Community Post</p>
              <h2 id="community-composer-title">社区发布</h2>
              <span>分享视频提示词心得，或把 Bug、体验卡点、生成质量问题写给管理员。</span>
            </div>
            <button class="community-modal-close" type="button" data-action="close-community-composer" aria-label="关闭">×</button>
          </div>
          <form class="community-form community-dialog-form" data-community-feedback-form>
            <label><span>标题</span><input name="title" maxlength="80" placeholder="例如：首尾帧生视频如何避免人物漂移" required autofocus /></label>
            <label><span>分类</span><select name="category"><option value="视频提示词心得">视频提示词心得</option><option value="问题反馈">问题反馈</option><option value="体验建议">体验建议</option><option value="生成质量">生成质量</option><option value="账号与付费">账号与付费</option></select></label>
            <label><span>具体内容</span><textarea name="content" rows="6" maxlength="800" placeholder="写下你的提示词结构、适用场景、踩坑点，或反馈你遇到的问题。" required></textarea></label>
            <button class="community-primary" type="button" data-action="submit-community-feedback">发布到社区</button>
          </form>
        </div>
      </div>
    `;
  }
  return "";
}

function renderCommunityMyPostsModal({ ui, session, posts }) {
  if (!ui.communityMyPostsOpen) return "";
  const userKey = communitySessionKey(session);
  const myPosts = userKey ? sortCommunityPosts(posts.filter((post) => isCommunityOwnPost(post, session))) : [];
  const rows = myPosts.length
    ? myPosts.map((post) => renderCommunityMyPostRow(post, ui)).join("")
    : `<div class="community-my-empty">${userKey ? "你还没有发布过帖子。" : "请先登录后查看自己的帖子。"}</div>`;
  return `
    <div class="community-modal" role="dialog" aria-modal="true" aria-labelledby="community-my-posts-title">
      <div class="community-modal-panel community-my-posts-panel">
        <div class="community-modal-head">
          <div>
            <p class="community-eyebrow">My Posts</p>
            <h2 id="community-my-posts-title">我的帖子</h2>
            <span>只显示你自己发布的社区内容，可修改或删除。</span>
          </div>
          <button class="community-modal-close" type="button" data-action="close-community-my-posts" aria-label="关闭">×</button>
        </div>
        <div class="community-my-posts-list">${rows}</div>
      </div>
    </div>
  `;
}

function renderCommunityMyPostRow(post, ui = {}) {
  const editing = String(ui.communityEditingPostId ?? "") === String(post.id ?? "");
  const likedBy = Array.isArray(post.likedBy) ? post.likedBy : [];
  const comments = Array.isArray(post.comments) ? post.comments : [];
  const likeCount = Number(post.likes ?? likedBy.length ?? 0);
  const commentCount = communityPostCommentCount(comments);
  const commentsOpen = String(ui.communityCommentPostId ?? "") === String(post.id ?? "");
  if (editing) {
    return `
      <form class="community-form community-my-post-editor" data-community-edit-post-form data-post-id="${escapeAttr(post.id || "")}">
        <label><span>标题</span><input name="title" maxlength="80" value="${escapeAttr(post.title || "")}" required /></label>
        <label><span>分类</span><select name="category">${["视频提示词心得", "问题反馈", "体验建议", "生成质量", "账号与付费"].map((category) => `<option value="${escapeAttr(category)}" ${post.category === category ? "selected" : ""}>${escapeHtml(category)}</option>`).join("")}</select></label>
        <label><span>具体内容</span><textarea name="content" rows="4" maxlength="800" required>${escapeHtml(post.content || "")}</textarea></label>
        <div class="community-my-post-actions">
          <button type="button" data-action="save-community-post-edit">保存</button>
          <button type="button" data-action="cancel-community-post-edit">取消</button>
        </div>
      </form>
    `;
  }
  return `
    <article class="community-my-post-row">
      <div>
        <h3>${escapeHtml(post.title || "未命名反馈")}</h3>
        <p>${escapeHtml(post.content || "")}</p>
        <div class="community-my-post-meta">
          <span>${escapeHtml(post.category || "问题反馈")} · ${escapeHtml(post.createdAtLabel || post.createdAt || "")}</span>
          <span>点赞 · ${likeCount}</span>
          <button type="button" data-action="toggle-community-comments" data-post-id="${escapeAttr(post.id || "")}" aria-expanded="${commentsOpen ? "true" : "false"}">
            ${commentsOpen ? "收起评论" : "查看评论"} · ${commentCount}
          </button>
        </div>
        ${commentsOpen ? `<div class="community-my-post-comments">${renderCommunityCommentRows(post, { replyTarget: String(ui.communityReplyTarget ?? "") })}</div>` : ""}
      </div>
      <div class="community-my-post-actions">
        <button type="button" data-action="edit-community-post" data-post-id="${escapeAttr(post.id || "")}">修改</button>
        <button class="danger" type="button" data-action="delete-community-post" data-post-id="${escapeAttr(post.id || "")}">删除</button>
      </div>
    </article>
  `;
}

function communityPostCommentCount(comments = []) {
  return comments.reduce((sum, comment) => sum + 1 + (Array.isArray(comment.replies) ? comment.replies.length : 0), 0);
}

function renderCommunityPost(post, session = {}, ui = {}) {
  const userKey = communitySessionKey(session);
  const likedBy = Array.isArray(post.likedBy) ? post.likedBy.map(String) : [];
  const comments = Array.isArray(post.comments) ? post.comments : [];
  const liked = userKey ? likedBy.includes(userKey) : false;
  const likeCount = Number(post.likes ?? likedBy.length ?? 0);
  const commentCount = communityPostCommentCount(comments);
  const commentsOpen = String(ui.communityCommentPostId ?? "") === String(post.id ?? "");
  const replyTarget = String(ui.communityReplyTarget ?? "");
  return `
    <article class="community-post">
      <div class="community-post-head"><span class="community-tag">${escapeHtml(post.category || "问题反馈")}</span><h3>${escapeHtml(post.title || "未命名反馈")}</h3></div>
      <p>${escapeHtml(post.content || "")}</p>
      <footer><span>${escapeHtml(post.author || "灵曦用户")}</span><span>${escapeHtml(post.createdAtLabel || post.createdAt || "")}</span></footer>
      <div class="community-post-actions">
        <button class="community-social-action comment" type="button" data-action="toggle-community-comments" data-post-id="${escapeAttr(post.id || "")}" aria-label="查看 ${commentCount} 条评论">
          ${renderCommunitySocialIcon("comment")}
          <span>评论 · ${commentCount}</span>
        </button>
        <button class="community-social-action like ${liked ? "liked" : ""}" type="button" data-action="like-community-post" data-post-id="${escapeAttr(post.id || "")}" aria-label="${liked ? "取消点赞" : "点赞"}，当前 ${likeCount} 个点赞">
          ${renderCommunitySocialIcon("like")}
          <span>点赞 · ${likeCount}</span>
        </button>
      </div>
      <div class="community-comments">${renderCommunityCommentRows(post, { replyTarget })}</div>
      ${commentsOpen ? `
        <form class="community-comment-form" data-community-comment-form data-post-id="${escapeAttr(post.id || "")}">
          <input name="content" maxlength="240" placeholder="写评论，补充经验或追问细节" />
          <button type="button" data-action="submit-community-comment">评论</button>
        </form>
      ` : ""}
    </article>
  `;
}

function renderCommunityCommentRows(post = {}, { replyTarget = "" } = {}) {
  const comments = Array.isArray(post.comments) ? post.comments : [];
  if (!comments.length) {
    return `<div class="community-comment-empty">暂无评论，写下你的补充或经验。</div>`;
  }
  return `${comments.slice(0, 5).map((comment) => `
    <div class="community-comment">
      <div class="community-comment-main">
        <div class="community-comment-line"><strong>${escapeHtml(comment.author || "灵曦用户")}</strong><span>${escapeHtml(comment.content || "")}</span></div>
        <div class="community-comment-meta"><small>${escapeHtml(comment.createdAtLabel || comment.createdAt || "")}</small><button type="button" data-action="toggle-community-reply" data-post-id="${escapeAttr(post.id || "")}" data-comment-id="${escapeAttr(comment.id || "")}" data-reply-author="${escapeAttr(comment.author || "灵曦用户")}">回复</button></div>
      </div>
      ${renderCommunityReplies(comment)}
      ${replyTarget === `${post.id || ""}:${comment.id || ""}` ? `
        <form class="community-comment-form reply" data-community-reply-form data-post-id="${escapeAttr(post.id || "")}" data-comment-id="${escapeAttr(comment.id || "")}">
          <input name="content" maxlength="240" placeholder="回复 ${escapeAttr(comment.author || "灵曦用户")}" />
          <button type="button" data-action="submit-community-reply">回复</button>
        </form>
      ` : ""}
    </div>
  `).join("")}${comments.length > 5 ? `<div class="community-comment-more">...</div>` : ""}`;
}

function renderCommunityReplies(comment = {}) {
  const replies = Array.isArray(comment.replies) ? comment.replies : [];
  if (!replies.length) return "";
  return `
    <div class="community-replies">
      ${replies.slice(0, 5).map((reply) => `
        <div class="community-reply">
          <div class="community-comment-line"><strong>${escapeHtml(reply.author || "灵曦用户")}</strong><span>${escapeHtml(reply.content || "")}</span></div>
          <small>${escapeHtml(reply.createdAtLabel || reply.createdAt || "")}</small>
        </div>
      `).join("")}
      ${replies.length > 5 ? `<div class="community-comment-more">...</div>` : ""}
    </div>
  `;
}

function renderCommunitySocialIcon(type) {
  if (type === "like") {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M8.1 21H4.2A2.2 2.2 0 0 1 2 18.8v-7.2a2.2 2.2 0 0 1 2.2-2.2h3.9V21Zm2-11.5 3.4-6.8c.28-.56.96-.8 1.54-.54 1.65.73 2.45 2.62 1.84 4.32l-.95 2.67h3.74a2.45 2.45 0 0 1 2.42 2.83l-1.13 6.78A2.7 2.7 0 0 1 18.3 21h-8.2V9.5Z" />
      </svg>
    `;
  }
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5.2 3h13.6A3.2 3.2 0 0 1 22 6.2v8.2a3.2 3.2 0 0 1-3.2 3.2H9.4l-5.7 3.9a.7.7 0 0 1-1.1-.58V6.2A3.2 3.2 0 0 1 5.2 3Z" />
    </svg>
  `;
}

function renderCommunityFeature(feature, session = {}) {
  const userKey = communitySessionKey(session);
  const voterIds = Array.isArray(feature.voterIds) ? feature.voterIds.map(String) : [];
  const voted = userKey ? voterIds.includes(userKey) : false;
  return `<article class="community-feature-card"><button class="community-vote ${voted ? "voted" : ""}" type="button" data-action="vote-community-feature" data-feature-id="${escapeAttr(feature.id || "")}" aria-label="为${escapeAttr(feature.title || "功能")}投票"><strong>${Number(feature.votes || 0)}</strong><span>${voted ? "已投" : "投票"}</span></button><div><h3>${escapeHtml(feature.title || "未命名功能")}</h3><p>${escapeHtml(feature.content || "")}</p><small>${escapeHtml(feature.author || "灵曦用户")} · ${escapeHtml(feature.createdAtLabel || feature.createdAt || "")}</small></div></article>`;
}

function communitySessionKey(session = {}) {
  return String(session?.user?.id || session?.user?.phone || session?.user?.email || "").trim();
}

function isCommunityOwnPost(post = {}, session = {}) {
  const userKey = communitySessionKey(session);
  const phoneTail = String(session?.user?.phone ?? "").slice(-4);
  return Boolean(userKey && (String(post.userId || "") === userKey || (phoneTail && String(post.author || "").endsWith(phoneTail))));
}

function renderCommunityPromptInsight(post) {
  const meta = post.promptMeta || {};
  const tags = Array.isArray(meta.tags) && meta.tags.length ? meta.tags : ["镜头", "动作", "稳定性"];
  return `
    <article class="community-insight-card">
      <div class="community-insight-topline">
        <span>${escapeHtml(meta.scene || "视频生成")}</span>
        <strong>${escapeHtml(meta.model || "通用视频模型")}</strong>
      </div>
      <h3>${escapeHtml(post.title || "视频提示词心得")}</h3>
      <p>${escapeHtml(post.content || "")}</p>
      <div class="community-prompt-snippet">
        <span>提示词片段</span>
        <code>${escapeHtml(meta.prompt || "主体保持一致，镜头缓慢推进，动作自然连贯，柔和电影光。")}</code>
      </div>
      <footer>
        <span>${escapeHtml(post.author || "灵曦用户")}</span>
        <div>${tags.map((tag) => `<em>${escapeHtml(tag)}</em>`).join("")}</div>
      </footer>
    </article>
  `;
}

function defaultCommunityPromptInsights() {
  return [
    {
      title: "先锁定主体，再写镜头运动",
      content: "我会把人物服装、发型、道具写在第一句，第二句才写镜头推进。主体信息越靠前，角色越不容易漂。",
      author: "南城分镜师",
      category: "视频提示词心得",
      createdAtLabel: "6月18日 10:20",
      promptMeta: {
        scene: "角色口播",
        model: "首帧生视频",
        prompt: "同一位短发女主，白色风衣，手持咖啡杯，镜头缓慢推近，眼神看向窗外，柔和晨光。",
        tags: ["主体一致", "推镜", "口播"],
      },
    },
    {
      title: "动作不要堆太多，拆成一个主动作",
      content: "同一个镜头里让角色转身、跑步、回头、挥手，模型会发散。我通常只保留一个主动作，再补情绪。",
      author: "阿泽导演台",
      category: "视频提示词心得",
      createdAtLabel: "6月18日 09:48",
      promptMeta: {
        scene: "动作镜头",
        model: "参考生视频",
        prompt: "少年向前奔跑，衣摆随风摆动，镜头平稳跟拍，背景轻微运动模糊，紧张但克制。",
        tags: ["单动作", "跟拍", "运动模糊"],
      },
    },
    {
      title: "负面提示词只写会破坏画面的点",
      content: "负面词太多会稀释主提示。我只写变形手、人物漂移、闪烁字幕、额外肢体这类高频问题。",
      author: "镜头炼金室",
      category: "视频提示词心得",
      createdAtLabel: "6月17日 22:15",
      promptMeta: {
        scene: "稳定性",
        model: "首尾帧",
        prompt: "避免人物面部变形、额外手指、画面闪烁、字幕漂浮、主体身份变化。",
        tags: ["负面词", "稳定", "首尾帧"],
      },
    },
  ];
}

function renderInteriorAssetCard(label, kind, accent, count, previews = []) {
  const previewItems = Array.isArray(previews) ? previews : [];
  const visualPreviews = kind === "other"
    ? previewItems.filter((preview) => {
        const value = String(preview ?? "").trim();
        return /^data:image\//i.test(value) || /\.(?:png|jpe?g|webp|gif|avif|svg)(?:[?#]|$)/i.test(value);
      })
    : previewItems;
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
        visualPreviews.length
          ? `<span class="asset-card-preview-stack" aria-hidden="true">
              ${visualPreviews
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
    return `
      <div class="seo-home-scroll">
        ${renderHomeHero({ detailState, session, ui })}
      </div>
    `;
  }

  if (activeNavTab === "director") {
    return renderDirectorDeskSurface(ui);
  }

  if (activeNavTab === "script") {
    return renderScrollableWorkbenchSurface("script", `
      ${renderScriptManagementPage({ state, ui: { ...ui, toast: "", session }, session })}
      ${renderInlineStatusToast(ui)}
    `);
  }

  if (activeNavTab === "prompts") {
    return renderScrollableWorkbenchSurface("prompts", `
      ${renderPromptPlazaPage(ui)}
      ${renderInlineStatusToast(ui)}
    `);
  }

  if (activeNavTab === "library") {
    const shouldUsePublicOfficialAssets =
      !hasActiveSessionUser(session) &&
      (ui.libraryTeamAssetScope ?? "official") === "official";
    return renderScrollableWorkbenchSurface("library", `
      ${renderLibraryTeam({
        route: "assets",
        assetScope: ui.libraryTeamAssetScope,
        libraryCategory: ui.libraryCategory,
        libraryFolder: ui.libraryFolder,
        libraryQuery: ui.libraryQuery,
        libraryCategories: ui.libraryCategories,
        libraryFolders: ui.libraryFolders,
        libraryAssets: shouldUsePublicOfficialAssets ? undefined : ui.libraryAssets,
        libraryEntitlement: ui.libraryEntitlement,
        teamAssetLocalUploads: ui.teamAssetLocalUploads,
        assetSearchQuery: ui.assetSearchQuery ?? "",
        assetSortOrder: ui.assetSortOrder ?? "desc",
        assetFilterMode: ui.assetFilterMode ?? "all",
        assetViewMode: ui.assetViewMode ?? "grid",
        assetLibraryPage: ui.assetLibraryPage ?? 1,
        assetCardMenuId: ui.assetCardMenuId ?? null,
        projectAssetPreviewPlayingId: ui.projectAssetPreviewPlayingId ?? null,
        isTeamMember: isTeamMemberSession(session),
        libraryLoading: ui.libraryLoading,
        libraryError: ui.libraryError,
        libraryDetailAssetId: ui.libraryDetailAssetId,
        libraryDetailView: ui.libraryDetailView,
        pricingOpen: Boolean(ui.isLibraryPricingModalOpen),
        billingPackages: ui.billingPackages ?? [],
        membershipPlans: ui.membershipPlans ?? [],
        membershipStatus: ui.membershipStatus ?? null,
        billingOrder: ui.lastBillingOrder ?? null,
        paymentIntent: ui.lastPaymentIntent ?? null,
        paymentAction: ui.lastPaymentAction ?? null,
        membershipPaymentState: resolveMembershipPaymentState(ui),
        enterpriseContactOpen: ui.isEnterpriseContactModalOpen === true,
        enterpriseContactImageUrl: ui.customerSupportConfig?.enterpriseContactImageUrl
          ? resolveApiUrl(ui.customerSupportConfig.enterpriseContactImageUrl)
          : "",
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
      ${renderInlineStatusToast(ui)}
    `);
  }

function renderPromptPlazaPage(ui = {}) {
  const typeLabels = {
    all: "全部",
    script: "剧本提示词",
    shot: "分镜提示词",
    scene_extract: "场景抽取提示词",
    character_extract: "人物抽取提示词",
    prop_extract: "道具抽取提示词",
    image_style: "生图风格提示词",
    storyboard: "故事板提示词",
    other: "其它",
  };
  const sectionLabels = {
    marketplace: "提示词广场",
    library: "我的提示词库",
  };
  const activeSection = Object.prototype.hasOwnProperty.call(sectionLabels, ui.promptPlazaSection)
    ? ui.promptPlazaSection
    : "marketplace";
  const activeType = Object.prototype.hasOwnProperty.call(typeLabels, ui.promptPlazaType) ? ui.promptPlazaType : "all";
  const query = String(ui.promptPlazaQuery ?? "").trim().toLowerCase();
  const fallbackItems = (Array.isArray(ui.storyboardPromptPackages) ? ui.storyboardPromptPackages : []).map((item) => ({
    id: String(item.id ?? item.code ?? ""),
    title: String(item.name ?? item.code ?? "官方提示词"),
    category: "script",
    summary: "官方发布的剧本提示词，可免费添加到私人提示词库使用。",
    coverImageUrl: String(item.coverImageUrl ?? item.cover_image_url ?? "").trim(),
    priceCredits: 0,
    official: true,
    publisherName: "官方",
    usageCount: 0,
    ratingAverage: 5,
    ratingCount: 0,
    owned: false,
    purchased: false,
    canUse: false,
    contentVisible: false,
  }));
  const catalog = Array.isArray(ui.promptMarketplaceItems)
    ? ui.promptMarketplaceItems
    : fallbackItems;
  const items = catalog;
  const rankedItems = (Array.isArray(ui.promptMarketplaceRankings) ? ui.promptMarketplaceRankings : []).slice(0, 20);
  const marketplaceMeta = ui.promptMarketplaceMeta || {};
  const marketplacePage = Math.max(1, Number(marketplaceMeta.page || ui.promptMarketplacePage || 1));
  const marketplacePageSize = Math.max(1, Number(marketplaceMeta.pageSize || 12));
  const marketplaceTotal = Math.max(0, Number(marketplaceMeta.total ?? items.length));
  const marketplaceTotalPages = Math.max(1, Number(marketplaceMeta.totalPages || Math.ceil(marketplaceTotal / marketplacePageSize) || 1));
  const marketplacePages = buildProjectPageItems(marketplacePage, marketplaceTotalPages);
  const library = (Array.isArray(ui.promptMarketplaceLibrary) ? ui.promptMarketplaceLibrary : [])
    .filter((item) => activeType === "all" || item.category === activeType)
    .filter((item) => !query || [item.title, item.summary].join(" ").toLowerCase().includes(query));
  const libraryPageSize = 10;
  const libraryPageCount = Math.max(1, Math.ceil(library.length / libraryPageSize));
  const libraryPage = Math.min(Math.max(Number(ui.promptLibraryPage || 1), 1), libraryPageCount);
  const visibleLibraryItems = library.slice((libraryPage - 1) * libraryPageSize, libraryPage * libraryPageSize);
  const deleteDraft = ui.promptMarketplaceDeleteConfirm;
  const editItem = ui.promptMarketplaceEditItem?.owned === true ? ui.promptMarketplaceEditItem : null;
  const rankingDetailItem = [...rankedItems, ...catalog].find((item) => String(item.id) === String(ui.promptMarketplaceRankingItemId || "")) || null;

  const renderRating = (item, interactive = false) => {
    const average = Number(item.ratingAverage || 5);
    const rounded = Math.round(average);
    const userRating = Number(item.userRating || 0);
    return `<span class="prompt-marketplace-rating" aria-label="推荐星级 ${average.toFixed(1)}">
      ${[1, 2, 3, 4, 5].map((rating) => interactive
        ? `<button type="button" class="${rating <= (userRating || (Number(item.ratingCount || 0) === 0 ? 5 : 0)) ? "active" : ""}" data-action="rate-prompt-marketplace-item" data-prompt-id="${escapeAttr(item.id)}" data-rating="${rating}" title="推荐 ${rating} 星" ${userRating ? "disabled" : ""}>★</button>`
        : `<span class="${rating <= rounded ? "active" : ""}">★</span>`).join("")}
      <small>${average.toFixed(1)}</small>
    </span>`;
  };

  const renderDefaultCover = (item, extraClass = "") => {
    const coverKinds = {
      script: "script",
      storyboard: "storyboard",
      shot: "shot",
      scene_extract: "scene",
      character_extract: "character",
      prop_extract: "prop",
      image_style: "style",
    };
    const coverImages = {
      character_extract: "/assets/library/official/characters/3d-city-heroine.png",
      scene_extract: "/assets/library/official/scenes/scene-3d-neon-street.png",
      prop_extract: "/assets/library/official/props/prop-ancient-sword.png",
    };
    const coverMontages = {
      shot: [
        "/assets/library/official/scenes/scene-3d-neon-street.png",
        "/assets/library/official/characters/3d-city-heroine.png",
        "/assets/library/official/props/prop-ancient-sword.png",
      ],
      image_style: [
        "/assets/library/official/scenes/scene-2d-starry.png",
        "/assets/library/official/scenes/scene-3d-neon-street.png",
        "/assets/library/official/scenes/scene-ancient-garden.png",
      ],
    };
    const kind = coverKinds[item.category] ?? "other";
    const label = typeLabels[item.category] ?? "提示词";
    const imageUrl = coverImages[item.category];
    const montageImages = coverMontages[item.category];
    if (montageImages) {
      return `<div class="prompt-marketplace-cover prompt-marketplace-default-cover is-${kind} has-montage ${escapeAttr(extraClass)}" role="img" aria-label="${escapeAttr(label)}通用封面">${montageImages.map((url) => `<img src="${escapeAttr(url)}" alt="" loading="lazy" />`).join("")}</div>`;
    }
    return `<div class="prompt-marketplace-cover prompt-marketplace-default-cover is-${kind}${imageUrl ? " has-image" : ""} ${escapeAttr(extraClass)}" role="img" aria-label="${escapeAttr(label)}通用封面">${imageUrl ? `<img src="${escapeAttr(imageUrl)}" alt="" loading="lazy" />` : "<span></span><span></span><span></span>"}</div>`;
  };

  const renderMarketplaceCard = (item) => {
    const inLibrary = item.owned || item.purchased;
    const price = Number(item.priceCredits || 0);
    const coverImageUrl = String(item.coverImageUrl ?? item.cover_image_url ?? "").trim();
    const cover = coverImageUrl
      ? `<div class="prompt-marketplace-cover"><img src="${escapeAttr(resolveApiUrl(coverImageUrl))}" alt="${escapeAttr(item.title || "提示词")}封面" loading="lazy" /></div>`
      : renderDefaultCover(item);
    return `<article class="prompt-marketplace-card ${item.official ? "is-official" : "is-private"} has-cover">
      <header class="prompt-marketplace-card-head">
        <h2>${escapeHtml(item.title || "未命名提示词")}</h2>
        <span class="prompt-marketplace-source ${item.official ? "official" : "private"}">${item.official ? "官方" : "私人发布"}</span>
        <div class="prompt-marketplace-card-labels">
          <div class="prompt-marketplace-badges">
            <span class="prompt-plaza-type">${escapeHtml(typeLabels[item.category] ?? "提示词")}</span>
          </div>
          <span class="prompt-marketplace-price ${price === 0 ? "free" : ""}">${price === 0 ? "免费使用" : `使用 ${price} 积分`}</span>
        </div>
      </header>
      ${cover}
      <p>${escapeHtml(item.summary || "暂无公开简介")}</p>
      <div class="prompt-marketplace-meta">
        <span>${Number(item.usageCount || 0).toLocaleString("zh-CN")} 次使用</span>
        ${renderRating(item)}
      </div>
      ${inLibrary ? "" : `<footer><button type="button" class="prompt-marketplace-buy" data-action="purchase-prompt-marketplace-item" data-prompt-id="${escapeAttr(item.id)}">免费添加</button></footer>`}
    </article>`;
  };

  const renderRankingAction = (item) => {
    const inLibrary = item.owned || item.purchased;
    return inLibrary
      ? `<button type="button" class="prompt-marketplace-ranking-action is-added" disabled>已添加</button>`
      : `<button type="button" class="prompt-marketplace-ranking-action" data-action="purchase-prompt-marketplace-item" data-prompt-id="${escapeAttr(item.id)}">免费添加</button>`;
  };

  const rankingContent = `<aside class="prompt-marketplace-ranking" aria-label="提示词排行榜">
    <header><div><span>TOP PROMPTS</span><h3>提示词排行榜 · 全部分类</h3></div></header>
    <ol>${rankedItems.length ? rankedItems.map((item, index) => `<li><button type="button" class="prompt-marketplace-ranking-main" data-action="open-prompt-marketplace-ranking-item" data-prompt-id="${escapeAttr(item.id)}" aria-label="查看排行榜第 ${index + 1} 名 ${escapeAttr(item.title || "未命名提示词")}"><span class="prompt-marketplace-ranking-rank">${index + 1}</span><div><strong>${escapeHtml(item.title || "未命名提示词")}</strong><span class="prompt-marketplace-ranking-metrics"><span>${Number(item.usageCount || 0).toLocaleString("zh-CN")} 次使用</span>${renderRating(item)}</span></div></button>${renderRankingAction(item)}</li>`).join("") : `<li class="prompt-marketplace-ranking-empty">暂无可排行提示词</li>`}</ol>
  </aside>`;
  const marketplacePagination = `<footer class="prompt-marketplace-pagination project-gallery-pagination" aria-label="提示词广场分页">
    <div class="project-gallery-pagination-summary"><span>共 ${marketplaceTotal.toLocaleString("zh-CN")} 条</span><span>${marketplacePageSize} 条/页</span></div>
    <div class="project-gallery-pagination-controls">
      <button class="project-gallery-page-button" type="button" data-action="set-prompt-marketplace-page" data-page="${marketplacePage - 1}" ${marketplacePage <= 1 ? "disabled" : ""} aria-label="上一页">‹</button>
      ${marketplacePages.map((page) => page === "ellipsis"
        ? '<span class="project-gallery-page-ellipsis" aria-hidden="true">…</span>'
        : `<button class="project-gallery-page-button ${page === marketplacePage ? "active" : ""}" type="button" data-action="set-prompt-marketplace-page" data-page="${page}" aria-current="${page === marketplacePage ? "page" : "false"}">${page}</button>`).join("")}
      <button class="project-gallery-page-button" type="button" data-action="set-prompt-marketplace-page" data-page="${marketplacePage + 1}" ${marketplacePage >= marketplaceTotalPages || marketplaceMeta.hasNext === false ? "disabled" : ""} aria-label="下一页">›</button>
    </div>
  </footer>`;
  const marketplaceContent = ui.promptMarketplaceLoading
    ? `<section class="prompt-marketplace-workspace"><div class="prompt-plaza-empty prompt-plaza-loading" aria-live="polite"><strong>正在加载提示词广场</strong><span>官方提示词即将显示。</span></div></section>`
    : `<section class="prompt-marketplace-workspace"><div class="prompt-marketplace-layout"><div class="prompt-plaza-grid" aria-live="polite">
        ${items.length ? items.map(renderMarketplaceCard).join("") : `<div class="prompt-plaza-empty"><strong>${ui.promptMarketplaceError ? "官方提示词暂未同步" : "未找到匹配的提示词"}</strong><span>${ui.promptMarketplaceError ? "请点击左侧提示词广场或刷新页面重试。" : "换个关键词或分类试试。"}</span></div>`}
      </div>${rankingContent}</div>${marketplacePagination}</section>`;

  const renderLibraryItem = (item) => {
    const coverImageUrl = String(item.coverImageUrl ?? item.cover_image_url ?? "").trim();
    const price = Number(item.priceCredits || 0);
    const cover = coverImageUrl
      ? `<div class="prompt-marketplace-cover"><img src="${escapeAttr(resolveApiUrl(coverImageUrl))}" alt="${escapeAttr(item.title || "提示词")}封面" loading="lazy" /></div>`
      : renderDefaultCover(item);
    const defaultAction = `<button type="button" class="prompt-marketplace-default ${item.isDefault ? "active" : ""}" data-action="${item.isDefault ? "clear" : "set"}-prompt-marketplace-default" data-prompt-id="${escapeAttr(item.id)}" data-prompt-category="${escapeAttr(item.category)}">${item.isDefault ? "取消默认" : "设为默认"}</button>`;
    return `<article class="prompt-marketplace-card ${item.owned ? "is-private" : "is-purchased"} has-cover">
      <header class="prompt-marketplace-card-head">
        <h2>${escapeHtml(item.title || "未命名提示词")}</h2>
        <span class="prompt-marketplace-source ${item.owned ? "private" : ""}">${item.owned ? "我发布的" : "已添加"}</span>
        <div class="prompt-marketplace-card-labels">
          <div class="prompt-marketplace-badges">
            <span class="prompt-plaza-type">${escapeHtml(typeLabels[item.category] ?? "提示词")}</span>
            ${item.isDefault ? `<span class="prompt-marketplace-default-badge">默认</span>` : ""}
          </div>
          <span class="prompt-marketplace-price ${price === 0 ? "free" : ""}">${price === 0 ? "免费使用" : `使用 ${price} 积分`}</span>
        </div>
      </header>
      ${cover}
      <p>${escapeHtml(item.summary || "暂无公开简介")}</p>
      <div class="prompt-marketplace-meta">
        <span>${Number(item.usageCount || 0).toLocaleString("zh-CN")} 次使用</span>
        ${renderRating(item, item.purchased === true)}
      </div>
      <footer>
        ${defaultAction}
        ${item.owned
          ? `<button type="button" class="prompt-marketplace-edit" data-action="open-edit-prompt-marketplace-item" data-prompt-id="${escapeAttr(item.id)}">编辑</button><button type="button" class="prompt-marketplace-remove" data-action="request-delete-prompt-marketplace-item" data-prompt-id="${escapeAttr(item.id)}" data-owned="true">删除</button>`
          : `<button type="button" class="prompt-marketplace-remove" data-action="request-delete-prompt-marketplace-item" data-prompt-id="${escapeAttr(item.id)}" data-owned="false">移除私人库</button>`}
      </footer>
    </article>`;
  };

  const libraryContent = `<section class="prompt-library-workspace">
    <div class="prompt-library-list">
      ${library.length ? visibleLibraryItems.map(renderLibraryItem).join("") : `<div class="prompt-plaza-empty"><strong>私人提示词库为空</strong><span>从广场添加，或创建自己的提示词。</span></div>`}
    </div>
    <footer class="prompt-library-footer">
      <div class="prompt-library-pagination" aria-label="私人提示词库分页">
        <span>共 ${library.length} 条</span>
        <span>${libraryPage} / ${libraryPageCount} 页</span>
        <button type="button" data-action="set-prompt-library-page" data-page="${libraryPage - 1}" ${libraryPage <= 1 ? "disabled" : ""} aria-label="上一页">‹</button>
        <button type="button" data-action="set-prompt-library-page" data-page="${libraryPage + 1}" ${libraryPage >= libraryPageCount ? "disabled" : ""} aria-label="下一页">›</button>
      </div>
      <button type="button" class="prompt-library-create" data-action="open-prompt-marketplace-create"><span aria-hidden="true">${renderRailIcon("plus")}</span>创建提示词</button>
    </footer>
  </section>`;

  const renderPromptMarketplaceCoverField = (item = {}) => {
    const coverImageUrl = String(item.coverImageUrl ?? item.cover_image_url ?? "").trim();
    const coverPreview = coverImageUrl
      ? `<img class="prompt-marketplace-cover-upload-preview" src="${escapeAttr(resolveApiUrl(coverImageUrl))}" alt="封面预览" loading="lazy" />`
      : `<span class="prompt-marketplace-cover-upload-empty">未上传封面</span>`;
    return `<div class="prompt-marketplace-cover-field"><span>封面</span><div class="prompt-marketplace-cover-upload">${coverPreview}<label class="prompt-marketplace-cover-upload-button">上传封面<input type="file" accept="image/*" hidden data-action="upload-prompt-marketplace-cover" /></label><input type="hidden" name="coverImageUrl" value="${escapeAttr(coverImageUrl)}" /><input type="hidden" name="coverStorageObjectId" value="${escapeAttr(item.coverStorageObjectId ?? item.cover_storage_object_id ?? "")}" /></div></div>`;
  };

  const createDialog = ui.promptMarketplaceCreateOpen ? `<div class="prompt-marketplace-create" role="dialog" aria-modal="true" aria-labelledby="prompt-create-title">
    <section>
      <header><div><span>CREATE PROMPT</span><h2 id="prompt-create-title">创建提示词</h2><p>正文仅自己可见，可仅保存到私人库，或同时发布到提示词广场。</p></div><button type="button" data-action="close-prompt-marketplace-create" aria-label="关闭创建提示词">×</button></header>
      <form id="prompt-marketplace-create-form" class="prompt-publish-form">
      <div class="prompt-publish-fields">
        <label><span>提示词名称</span><input name="title" maxlength="80" placeholder="例如：高密度短剧分镜提示词" required /></label>
        <label><span>分类</span><select name="category">${Object.entries(typeLabels).filter(([key]) => key !== "all").map(([key, label]) => `<option value="${key}">${label}</option>`).join("")}</select></label>
        <label class="is-wide"><span>公开简介</span><textarea name="summary" rows="3" maxlength="240" placeholder="描述用途、适用题材和输出特点，不要粘贴正文。" required></textarea></label>
        <label class="is-wide"><span>提示词正文</span><textarea name="content" rows="12" maxlength="50000" placeholder="只有你自己可以查看这段内容。" required></textarea></label>
        ${renderPromptMarketplaceCoverField()}
        <label><span>积分价格</span><input name="priceCredits" type="number" min="0" max="99999" step="1" value="0" /></label>
      </div>
        <div class="prompt-publish-submit"><label class="prompt-publish-choice"><input name="publish" type="checkbox" checked /><span><strong>发布到提示词广场</strong><small>取消勾选则仅保存到私人提示词库</small></span></label><button type="button" data-action="create-prompt-marketplace-item"><span aria-hidden="true">${renderRailIcon("plus")}</span>保存提示词</button></div>
      </form>
    </section>
  </div>` : "";

  const rankingDetailDialog = rankingDetailItem ? `<div class="prompt-marketplace-create prompt-marketplace-ranking-detail" role="dialog" aria-modal="true" aria-labelledby="prompt-ranking-detail-title"><section><header><div><span>RANKED PROMPT</span><h2 id="prompt-ranking-detail-title">排行榜提示词详情</h2></div><button type="button" data-action="close-prompt-marketplace-ranking-item" aria-label="关闭排行榜提示词详情">×</button></header>${renderMarketplaceCard(rankingDetailItem)}</section></div>` : "";

  const editDialog = editItem ? `<div class="prompt-marketplace-create" role="dialog" aria-modal="true" aria-labelledby="prompt-edit-title">
    <section>
      <header><div><span>EDIT PROMPT</span><h2 id="prompt-edit-title">编辑提示词</h2><p>修改自己的提示词内容、封面、积分价格和发布状态。</p></div><button type="button" data-action="close-edit-prompt-marketplace-item" aria-label="关闭编辑提示词">×</button></header>
      <form id="prompt-marketplace-edit-form" class="prompt-publish-form">
        <div class="prompt-publish-fields">
          <label><span>提示词名称</span><input name="title" maxlength="80" value="${escapeAttr(editItem.title || "")}" required /></label>
          <label><span>分类</span><select name="category">${Object.entries(typeLabels).filter(([key]) => key !== "all").map(([key, label]) => `<option value="${key}" ${key === editItem.category ? "selected" : ""}>${label}</option>`).join("")}</select></label>
          <label class="is-wide"><span>公开简介</span><textarea name="summary" rows="3" maxlength="240" required>${escapeHtml(editItem.summary || "")}</textarea></label>
          <label class="is-wide"><span>提示词正文</span><textarea name="content" rows="12" maxlength="50000" required>${escapeHtml(editItem.content || "")}</textarea></label>
          ${renderPromptMarketplaceCoverField(editItem)}
          <label><span>积分价格</span><input name="priceCredits" type="number" min="0" max="99999" step="1" value="${Number(editItem.priceCredits || 0)}" /></label>
        </div>
        <div class="prompt-publish-submit"><label class="prompt-publish-choice"><input name="publish" type="checkbox" ${editItem.status === "published" ? "checked" : ""} /><span><strong>发布到提示词广场</strong><small>取消勾选后将从广场下架，但仍保留在私人库</small></span></label><button type="button" data-action="update-prompt-marketplace-item">保存修改</button></div>
      </form>
    </section>
  </div>` : "";

  return `
    <section class="prompt-plaza-page" aria-label="提示词管理与广场">
      <nav class="prompt-workspace-tabs" aria-label="提示词工作区">
        ${Object.entries(sectionLabels).map(([section, label]) => `<button class="${section === activeSection ? "active" : ""}" type="button" data-action="set-prompt-plaza-section" data-section="${section}">${label}</button>`).join("")}
      </nav>
      <div class="prompt-plaza-tools">
        <nav class="prompt-plaza-tabs" aria-label="提示词分类">
          ${Object.entries(typeLabels).map(([type, label]) => `
            <button class="${type === activeType ? "active" : ""}" type="button" data-action="set-prompt-plaza-type" data-type="${type}" aria-pressed="${type === activeType}">${label}</button>
          `).join("")}
        </nav>
        <label class="prompt-plaza-search">
          <span aria-hidden="true">⌕</span>
          <input type="search" data-prompt-plaza-search-input value="${escapeAttr(ui.promptPlazaQuery ?? "")}" placeholder="搜索提示词名称或简介" aria-label="搜索提示词广场" />
        </label>
      </div>
      ${ui.promptMarketplaceError ? `<div class="prompt-marketplace-error">${escapeHtml(ui.promptMarketplaceError)}</div>` : ""}
      ${activeSection === "library" ? libraryContent : marketplaceContent}
      ${deleteDraft ? `<div class="prompt-marketplace-confirm" role="dialog" aria-modal="true" aria-labelledby="prompt-delete-title"><div><span>删除提示词</span><h2 id="prompt-delete-title">${deleteDraft.owned ? "停止发布并删除自己的提示词？" : "从私人提示词库移除？"}</h2><p>${deleteDraft.owned ? "删除后其他用户将无法继续添加该提示词。" : "移除后仍可随时从广场免费添加。"}</p><footer><button type="button" data-action="cancel-delete-prompt-marketplace-item">取消</button><button type="button" class="danger" data-action="confirm-delete-prompt-marketplace-item">确认删除</button></footer></div></div>` : ""}
      ${rankingDetailDialog}
      ${createDialog}
      ${editDialog}
    </section>
  `;
}

  if (activeNavTab === "community") {
    return renderScrollableWorkbenchSurface("community", `
      ${renderCommunityPage({ ui, session })}
      ${renderInlineStatusToast(ui)}
    `);
  }

  if (isCanvasNavTab(activeNavTab)) {
    if (ui.canvasProjectView !== "detail") {
      return renderScrollableWorkbenchSurface("tools", `
        ${renderToolsPanel(ui, state, session)}
      `);
    }
    return `
      ${renderToolsPanel(ui, state, session)}
    `;
  }

  if (activeNavTab === "team") {
    return renderScrollableWorkbenchSurface("team", `
      ${renderLibraryTeam({
        route: ui.libraryTeamRoute ?? "team",
        pricingOpen: Boolean(ui.isLibraryPricingModalOpen),
        billingPackages: ui.billingPackages ?? [],
        membershipPlans: ui.membershipPlans ?? [],
        membershipStatus: ui.membershipStatus ?? null,
        billingOrder: ui.lastBillingOrder ?? null,
        paymentIntent: ui.lastPaymentIntent ?? null,
        paymentAction: ui.lastPaymentAction ?? null,
        membershipPaymentState: resolveMembershipPaymentState(ui),
        enterpriseContactOpen: ui.isEnterpriseContactModalOpen === true,
        enterpriseContactImageUrl: ui.customerSupportConfig?.enterpriseContactImageUrl
          ? resolveApiUrl(ui.customerSupportConfig.enterpriseContactImageUrl)
          : "",
        rulesOpen: Boolean(ui.isMemberRulesModalOpen),
        memberConfirmModal: ui.teamMemberConfirmModal ?? null,
        createMemberModal: ui.isTeamMemberCreateOpen
          ? {
              open: true,
              draft: ui.teamMemberDraft ?? {},
              notice: ui.teamMemberCreateNotice ?? "",
              temporaryPassword: ui.teamTemporaryPassword ?? "",
              availableProjects: ui.projectLibrary ?? [],
              availableScripts: ui.scriptLibraryRecords ?? [],
              availableCanvases: ui.canvasProjects ?? [],
              availableDirectorDesks: ui.directorDesks ?? [],
              resourcePickerType: ui.teamMemberDraft?.resourcePickerType ?? "",
              resourcePickerPage: ui.teamMemberDraft?.resourcePickerPage ?? 1,
              resourcePagination: ui.teamMemberDraft?.resourcePagination ?? {},
              resourceCounts: ui.teamMemberDraft?.resourceCounts ?? {},
            }
          : null,
        editMemberModal: ui.editMemberModal ?? null,
        dashboardTab: ui.teamDashboardTab ?? "member-consumption",
        dashboardDateRange: ui.teamDashboardDateRange ?? "today",
        dashboardDateShortcut: ui.teamDashboardDateShortcut ?? "今天",
        dashboardSearchQuery: ui.teamDashboardSearchQuery ?? "",
        dashboardRoleFilter: ui.teamDashboardRoleFilter ?? "all",
        dashboardStatusFilter: ui.teamDashboardStatusFilter ?? "all",
        selectedDashboardMemberId: ui.selectedDashboardMemberId ?? null,
        teamPanelTab: ui.teamPanelTab ?? "members",
        teamCreditOperationFilter: ui.teamCreditOperationFilter ?? "all",
        teamCreditSearchQuery: ui.teamCreditSearchQuery ?? "",
        teamCreditDateShortcut: ui.teamCreditDateShortcut ?? "近7天",
        creditLedgerRows: ui.teamCreditLedgerRows ?? [],
        ownerAccount: ui.teamOwnerAccount ?? {
          phone: session?.user?.phone ?? session?.user?.email ?? "",
          displayName: "主账号",
          creditBalance: ui.teamOverview?.credits?.remaining ?? ui.teamOverview?.credits?.allocatable ?? 0,
        },
        memberGroups: ui.teamMemberGroups ?? [],
        projectName: detailState.project.name,
        overview: ui.teamOverview ?? null,
        members: ui.teamMembers ?? [],
        stats: ui.teamOverview ?? null,
        memberSearchQuery: ui.teamMemberSearchQuery ?? "",
        memberRoleFilter: ui.teamMemberRoleFilter ?? "all",
        memberStatusFilter: ui.teamMemberStatusFilter ?? "all",
      })}
      ${renderInlineStatusToast(ui)}
    `);
  }

  if (activeNavTab === "project" && ui.projectPanelMode !== "detail") {
    return renderScrollableWorkbenchSurface("project", `
      ${renderProjectGallery({ ui, session })}
    `);
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
              <button class="secondary-action compact" type="button" data-action="open-project-detail">进入工作台</button>
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
      storyboardPagination: getEpisodePreviewStoryboardPagination(activeEpisode?.id ?? "episode-primary", ui),
      selectedStoryboard: ui.selectedStoryboard,
      selectedStoryboardIds: ui.selectedStoryboardIds ?? [],
      storyboardPage: ui.storyboardPage ?? 1,
      storyboardPageSize: ui.storyboardPageSize ?? 10,
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
        assetImportModalSource: ui.assetImportModalSource ?? null,
        episodeAssetLibraryModal: ui.episodeAssetLibraryModal ?? null,
        episodeAssetLibraryCategory: ui.episodeAssetLibraryCategory ?? ui.projectAssetTab ?? "character",
        episodeAssetLibraryFolder: ui.episodeAssetLibraryFolder ?? "",
        episodeAssetLibraryQuery: ui.episodeAssetLibraryQuery ?? "",
        assetImportCategory: ui.assetImportCategory ?? "domestic-modern-city",
      assetImportDrafts: ui.assetImportDrafts ?? [],
      assetImportSelection: ui.assetImportSelection ?? [],
      membershipStatus: ui.membershipStatus ?? null,
      teamAssetLibraryEnabled: hasTeamAssetLibraryAccess(ui),
      assetImportPage: ui.assetImportPage ?? 1,
      assetImportPageSize: ui.assetImportPageSize ?? 10,
      assetImportPageSizeMenuOpen: Boolean(ui.assetImportPageSizeMenuOpen),
      assetImportOfficialAssets: ui.assetImportOfficialAssets ?? null,
      projectOtherAssetMediaType: normalizeProjectOtherAssetMediaType(ui.projectOtherAssetMediaType, "audio"),
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
        projectStyles: ui.projectStyles ?? [],
        projectStyleCode: resolveEpisodeProjectStyleCode(state, ui),
        selectedProjectStyleCode: resolveSelectedEpisodeProjectStyleCode(state, ui),
        },
        storyboardDeleteTarget: ui.storyboardDeleteId ?? null,
        storyboardImageDeleteTarget: ui.storyboardImageDeleteTarget ?? null,
        storyboardVideoDeleteTarget: ui.storyboardVideoDeleteTarget ?? null,
        assetInspector: ui.assetInspector ?? null,
        episodeVoiceTeamAssets: ui.episodeVoiceTeamAssets ?? [],
        episodeVoiceTeamLoading: Boolean(ui.episodeVoiceTeamLoading),
        episodeVoiceTeamError: ui.episodeVoiceTeamError ?? "",
      })}
    ${renderExportPanel({
      exportPreview: state.exportPreview,
      exportHistory: ui.exportHistory ?? [],
      exportPreviewResult: ui.exportPreviewResult ?? null,
      busy: ui.busy,
      canPreview: Boolean(state.shots?.length),
    })}
    ${renderInlineStatusToast(ui)}
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

function renderToolsPanel(ui = {}, state = {}, session = null) {
  if (ui.canvasProjectView !== "detail") {
    return renderCanvasProjectGallery({ ...ui, session });
  }
  if (ui.canvasHostMount === true) {
    return `
      <section class="new-canvas-workbench-host" data-new-canvas-mount aria-label="画布编辑器">
        <div class="new-canvas-loading-skeleton" role="status" aria-live="polite" aria-label="正在加载画布">
          <span class="new-canvas-loading-skeleton__rail"></span>
          <span class="new-canvas-loading-skeleton__stage"></span>
          <span class="new-canvas-loading-skeleton__panel"></span>
        </div>
      </section>
    `;
  }
  const canvasDocument = ui.canvasDocument ?? createDefaultCanvasDocument({
    canvasProjectId: ui.selectedCanvasProjectId ?? "",
  });
  const nodes = (Array.isArray(canvasDocument.nodes) ? canvasDocument.nodes : [])
    .filter((node) => !node?.data?.hiddenByCharacterId);
  const visibleCanvasDocument = {
    ...canvasDocument,
    nodes,
  };
  const viewport = canvasDocument.viewport ?? {};
  const zoomPercent = Math.round(Number(viewport.zoom ?? 1) * 100);
  const zoomMenuOpen = ui.canvasZoomMenuOpen === true;
  const canvasEdgeStyle = ui.canvasEdgeStyle === "orthogonal" ? "orthogonal" : "curve";
  const canvasEdgesHidden = ui.canvasEdgesHidden === true;
  const canvasGridVisible = viewport.gridVisible !== false;
  const canvasSnapEnabled = viewport.snapEnabled !== false;
  const viewportStyle = canvasViewportStyle(viewport);
  const gridStyle = canvasGridStyle(viewport);
  const sidebarMode = ["assets", "history"].includes(ui.canvasSidebarMode)
    ? ui.canvasSidebarMode
    : "nodes";
  const assetSidebarMode = sidebarMode === "assets" || sidebarMode === "history";
  const canvasAssets = Array.isArray(ui.canvasAssets) ? ui.canvasAssets : [];
  const canvasAssetSource = normalizeCanvasAssetSource(ui.canvasAssetSource);
  const canvasAssetMediaFilter = ["all", "image", "video", "audio"].includes(ui.canvasAssetMediaFilter)
    ? ui.canvasAssetMediaFilter
    : "all";
  const canvasAssetLayoutColumns = Math.min(6, Math.max(2, Number(ui.canvasAssetLayoutColumns ?? 3) || 3));
  const sidebarCollapsed = ui.canvasSidebarCollapsed !== false;
  const canvasPanelStyle = sidebarCollapsed
    ? "grid-template-columns:minmax(0, 1fr)"
    : assetSidebarMode
      ? `--canvas-asset-columns:${canvasAssetLayoutColumns};--canvas-sidebar-width:${Math.max(264, canvasAssetLayoutColumns * 118)}px`
      : "";
  const canManageGlobalCanvasAssets = !isTeamMemberSession(ui.session);
  const canDeleteCanvasDramaAssets = !isTeamMemberSession(ui.session);
  const canvasAssetProjects = Array.isArray(ui.canvasAssetProjects) ? ui.canvasAssetProjects : [];
  const canvasAssetProjectId = String(ui.canvasAssetProjectId ?? "").trim();
  const canvasDramaDrawerOpen = ui.canvasDramaDrawerOpen === true;
  const canvasDramaProjectId = String(ui.canvasDramaProjectId ?? canvasAssetProjectId).trim();
  const canvasDramaEpisodes = Array.isArray(ui.canvasDramaEpisodes) ? ui.canvasDramaEpisodes : [];
  const canvasDramaEpisodeId = String(ui.canvasDramaEpisodeId ?? "").trim();
  const canvasDramaAssets = Array.isArray(ui.canvasDramaAssets) ? ui.canvasDramaAssets : [];
  const canvasAssetSearch = String(ui.canvasAssetSearch ?? "").trim().toLocaleLowerCase();
  const visibleCanvasAssets = canvasAssetSearch
    ? canvasAssets.filter((asset) => `${asset?.title ?? ""} ${asset?.meta ?? ""} ${asset?.kind ?? ""}`.toLocaleLowerCase().includes(canvasAssetSearch))
    : canvasAssets;
  const canvasLibraryAssets = resolveCanvasLibraryAssets(ui, state, canvasAssetSource);
  const canvasAssetTags = [...new Set(canvasLibraryAssets.flatMap((asset) => Array.isArray(asset?.tags) ? asset.tags : []))]
    .map((tag) => String(tag ?? "").trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
  const canvasAssetTagFilter = String(ui.canvasAssetTagFilter ?? "").trim();
  const canvasGlobalAssetFolderFilter = String(ui.canvasGlobalAssetFolderFilter ?? "all").trim() || "all";
  const canvasGlobalAssetFolders = [...new Set(canvasLibraryAssets
    .map((asset) => String(asset?.folderName ?? "").trim())
    .filter(Boolean))].sort((left, right) => left.localeCompare(right, "zh-CN"));
  const filteredCanvasLibraryAssets = canvasAssetMediaFilter === "all"
    ? canvasLibraryAssets
    : canvasLibraryAssets.filter((asset) => asset?.kind === canvasAssetMediaFilter);
  const tagFilteredCanvasLibraryAssets = canvasAssetTagFilter
    ? filteredCanvasLibraryAssets.filter((asset) => Array.isArray(asset?.tags) && asset.tags.includes(canvasAssetTagFilter))
    : filteredCanvasLibraryAssets;
  const folderFilteredCanvasLibraryAssets = canvasAssetSource === "global" && canvasGlobalAssetFolderFilter !== "all"
    ? tagFilteredCanvasLibraryAssets.filter((asset) => canvasGlobalAssetFolderFilter === "unfiled"
      ? !String(asset?.folderName ?? "").trim()
      : String(asset?.folderName ?? "").trim() === canvasGlobalAssetFolderFilter)
    : tagFilteredCanvasLibraryAssets;
  const visibleCanvasLibraryAssets = canvasAssetSearch
    ? folderFilteredCanvasLibraryAssets.filter((asset) => `${asset?.title ?? ""} ${asset?.meta ?? ""} ${asset?.kind ?? ""} ${(asset?.tags ?? []).join(" ")}`.toLocaleLowerCase().includes(canvasAssetSearch))
    : folderFilteredCanvasLibraryAssets;
  const allSidebarAssets = canvasAssetSource === "outputs" ? visibleCanvasAssets : visibleCanvasLibraryAssets;
  const canvasAssetVisibleCount = Math.max(
    CANVAS_ASSET_RENDER_PAGE_SIZE,
    Number(ui.canvasAssetVisibleCount ?? CANVAS_ASSET_RENDER_PAGE_SIZE) || CANVAS_ASSET_RENDER_PAGE_SIZE,
  );
  const sidebarAssets = assetSidebarMode && sidebarMode === "assets"
    ? allSidebarAssets.slice(0, canvasAssetVisibleCount)
    : allSidebarAssets;
  const hasMoreCanvasAssets = sidebarMode === "assets" && sidebarAssets.length < allSidebarAssets.length;
  const canvasNodeFilter = normalizeCanvasNodeFilter(ui.canvasNodeFilter);
  const canvasNodeSearch = String(ui.canvasNodeSearch ?? "").trim().toLocaleLowerCase();
  const rawSidebarItems = buildCanvasSidebarItems(visibleCanvasDocument, {
    mode: assetSidebarMode ? "assets" : "nodes",
    assets: sidebarAssets,
    assetTransfers: ui.canvasAssetTransfers,
  });
  const historyItems = sidebarMode === "history"
    ? filterCanvasHistoryItems(ui.canvasGenerationHistoryItems, {
        filter: ui.canvasHistoryFilter,
        search: ui.canvasAssetSearch,
      })
    : [];
  const sidebarItems = sidebarMode === "history"
    ? historyItems
    : !assetSidebarMode
    ? filterCanvasSidebarNodeItems(rawSidebarItems, canvasNodeFilter, canvasNodeSearch)
    : rawSidebarItems;
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
  const selectedCanvasModelMenu = renderCanvasModelMenu(ui.episodeGenerationConfig, selectedNode, ui.openGenerationSelectMenu);
  const generatingCanvasNodeId = String(ui.canvasGeneratingNodeId ?? "");
  const selectedNodeGenerating = isCanvasNodeGenerating(selectedNode, generatingCanvasNodeId);
  const addMenuOpen = ui.canvasAddMenuOpen === true;
  const contextMenu = ui.canvasContextMenu && typeof ui.canvasContextMenu === "object"
    ? ui.canvasContextMenu
    : null;
  const scriptPicker = resolveCanvasScriptPicker(ui, state);
  const revisionConflict = renderCanvasRevisionConflict(ui.canvasRevisionConflict);
  const markdownFullscreenState = ui.canvasMarkdownFullscreen && typeof ui.canvasMarkdownFullscreen === "object"
    ? ui.canvasMarkdownFullscreen
    : null;
  const markdownFullscreenNode = markdownFullscreenState?.open === true
    ? nodes.find((node) => node.id === markdownFullscreenState.nodeId && ["markdown", "ai-markdown"].includes(node.type))
    : null;
  const videoFullscreenState = ui.canvasVideoFullscreen && typeof ui.canvasVideoFullscreen === "object"
    ? ui.canvasVideoFullscreen
    : null;
  const videoFullscreenNode = videoFullscreenState?.open === true
    ? nodes.find((node) => node.id === videoFullscreenState.nodeId && resolveCanvasNodeMediaKind(node) === "video")
    : null;
  return `
    <section class="canvas-panel" aria-label="画布" data-canvas-sidebar-mode="${escapeAttr(sidebarMode)}"${canvasPanelStyle ? ` style="${escapeAttr(canvasPanelStyle)}"` : ""}>
      <aside id="canvas-sidebar-panel" class="canvas-sidebar" aria-label="画布侧栏"${sidebarCollapsed ? ' style="display:none"' : ""}>
        <header class="canvas-sidebar-tabs" role="tablist" aria-label="画布资源切换">
          <button class="canvas-sidebar-tab ${sidebarMode === "nodes" ? "active" : ""}" type="button" role="tab" aria-selected="${sidebarMode === "nodes" ? "true" : "false"}" data-action="set-canvas-sidebar-mode" data-canvas-sidebar-mode="nodes">画布</button>
          <button class="canvas-sidebar-tab ${sidebarMode === "assets" ? "active" : ""}" type="button" role="tab" aria-selected="${sidebarMode === "assets" ? "true" : "false"}" data-action="set-canvas-sidebar-mode" data-canvas-sidebar-mode="assets">资产</button>
          <button class="canvas-sidebar-tab ${sidebarMode === "history" ? "active" : ""}" type="button" role="tab" aria-selected="${sidebarMode === "history" ? "true" : "false"}" data-action="set-canvas-sidebar-mode" data-canvas-sidebar-mode="history">历史</button>
        </header>
        <div class="canvas-sidebar-filter">
          <span class="canvas-filter-label">
            <span>${assetSidebarMode ? (sidebarMode === "history" ? "输出历史" : CANVAS_ASSET_SOURCE_OPTIONS.find((option) => option.id === canvasAssetSource)?.label ?? "资产") : "画布元素"}</span>
            <i aria-hidden="true">${renderCanvasIcon("sort")}</i>
          </span>
          ${sidebarMode === "assets" ? `<div class="canvas-asset-source-tabs" role="tablist" aria-label="资产来源">
            ${CANVAS_ASSET_SOURCE_OPTIONS.map((option) => `<button type="button" role="tab" class="${option.id === canvasAssetSource ? "active" : ""}" aria-selected="${option.id === canvasAssetSource}" data-action="set-canvas-asset-source" data-canvas-asset-source="${option.id}">${option.label}</button>`).join("")}
          </div>` : ""}
          ${sidebarMode === "assets" && canvasAssetSource === "global" ? `<div class="canvas-global-asset-tools" aria-label="全局资产上传">
            <select data-canvas-global-asset-category aria-label="全局资产分类">
              <option value="character" ${ui.canvasGlobalAssetCategory === "character" ? "selected" : ""}>角色图片</option>
              <option value="scene" ${ui.canvasGlobalAssetCategory === "scene" ? "selected" : ""}>场景图片</option>
              <option value="prop" ${ui.canvasGlobalAssetCategory === "prop" ? "selected" : ""}>道具图片</option>
              <option value="voice" ${ui.canvasGlobalAssetCategory === "voice" ? "selected" : ""}>音色音频</option>
            </select>
            <input type="file" data-canvas-global-asset-file accept="image/*,audio/*" hidden />
            <button type="button" data-action="trigger-canvas-global-asset-upload" aria-label="上传全局资产" title="上传全局资产">${renderCanvasIcon("plus")}</button>
          </div><label class="canvas-global-asset-folder-filter"><span>文件夹</span><select data-canvas-global-asset-folder-filter aria-label="筛选全局资产文件夹"><option value="all" ${canvasGlobalAssetFolderFilter === "all" ? "selected" : ""}>全部</option><option value="unfiled" ${canvasGlobalAssetFolderFilter === "unfiled" ? "selected" : ""}>未分类</option>${canvasGlobalAssetFolders.map((folder) => `<option value="${escapeAttr(folder)}" ${canvasGlobalAssetFolderFilter === folder ? "selected" : ""}>${escapeHtml(folder)}</option>`).join("")}</select></label>` : ""}
          ${sidebarMode === "assets" && canvasAssetSource === "drama" ? `<div class="canvas-drama-asset-tools" aria-label="短剧资产管理">
            <button type="button" data-action="toggle-canvas-drama-drawer" aria-expanded="${canvasDramaDrawerOpen}" aria-controls="canvas-drama-asset-drawer">${canvasDramaDrawerOpen ? "收起短剧资产" : "管理短剧资产"}</button>
          </div>
          ${canvasDramaDrawerOpen ? `<section id="canvas-drama-asset-drawer" class="canvas-drama-asset-drawer" aria-label="短剧资产管理面板">
            <label><span>项目</span><select data-canvas-drama-project ${canvasAssetProjects.length ? "" : "disabled"}>
              ${canvasAssetProjects.length ? canvasAssetProjects.map((project) => `<option value="${escapeAttr(project.id)}" ${project.id === canvasDramaProjectId ? "selected" : ""}>${escapeHtml(project.name)}</option>`).join("") : `<option value="">${ui.canvasAssetProjectsLoading ? "正在读取项目..." : "暂无可用项目"}</option>`}
            </select></label>
            <label><span>剧集</span><select data-canvas-drama-episode ${canvasDramaEpisodes.length ? "" : "disabled"}>
              ${canvasDramaEpisodes.length ? canvasDramaEpisodes.map((episode) => `<option value="${escapeAttr(episode.id)}" ${episode.id === canvasDramaEpisodeId ? "selected" : ""}>${escapeHtml(episode.title)}</option>`).join("") : `<option value="">${ui.canvasDramaEpisodesLoading ? "正在读取剧集..." : "暂无剧集"}</option>`}
            </select></label>
            <div class="canvas-drama-asset-create" aria-label="新建短剧资产">
              <select data-canvas-drama-asset-type aria-label="资产类型" ${canvasDramaEpisodeId ? "" : "disabled"}>
                <option value="role" ${ui.canvasDramaAssetCreate?.assetType === "role" ? "selected" : ""}>角色</option>
                <option value="scene" ${ui.canvasDramaAssetCreate?.assetType === "scene" ? "selected" : ""}>场景</option>
                <option value="prop" ${ui.canvasDramaAssetCreate?.assetType === "prop" ? "selected" : ""}>道具</option>
              </select>
              <input type="text" data-canvas-drama-asset-name value="${escapeAttr(ui.canvasDramaAssetCreate?.name ?? "")}" maxlength="120" placeholder="资产名称" aria-label="资产名称" ${canvasDramaEpisodeId ? "" : "disabled"} />
              <button type="button" data-action="create-canvas-drama-asset" ${canvasDramaEpisodeId ? "" : "disabled"}>新建</button>
              <input type="file" data-canvas-drama-asset-file accept="image/*" hidden />
              <button type="button" data-action="trigger-canvas-drama-asset-import" aria-label="导入短剧图片" title="导入短剧图片" ${canvasDramaEpisodeId ? "" : "disabled"}>${renderCanvasIcon("upload")}</button>
            </div>
            ${canDeleteCanvasDramaAssets ? `<button class="canvas-drama-asset-category-clear" type="button" data-action="clear-canvas-drama-asset-category" ${canvasDramaEpisodeId ? "" : "disabled"}>清空当前分类</button>` : ""}
            ${ui.canvasDramaEpisodesError ? `<p class="canvas-drama-asset-error">${escapeHtml(ui.canvasDramaEpisodesError)}</p>` : ""}
            ${ui.canvasDramaAssetsLoading ? `<p class="canvas-drama-asset-empty">正在读取短剧资产...</p>` : ui.canvasDramaAssetsError ? `<p class="canvas-drama-asset-error">${escapeHtml(ui.canvasDramaAssetsError)}</p>` : canvasDramaAssets.length ? `<div class="canvas-drama-asset-list">${canvasDramaAssets.map((asset) => `<article>
              ${asset.previewUrl ? `<img src="${escapeAttr(asset.previewUrl)}" alt="" loading="lazy" />` : `<span aria-hidden="true">${renderCanvasIcon("image")}</span>`}
              <div><strong>${escapeHtml(asset.name)}</strong><small>${escapeHtml(asset.assetType === "role" ? "角色" : asset.assetType === "scene" ? "场景" : "道具")}</small><div class="canvas-drama-asset-description"><input type="text" data-canvas-drama-asset-description data-asset-id="${escapeAttr(asset.id)}" value="${escapeAttr(ui.canvasDramaAssetEdits?.[asset.id]?.description ?? asset.description ?? "")}" maxlength="2000" placeholder="资产简介" aria-label="${escapeAttr(`${asset.name} 的简介`)}" /><button type="button" data-action="save-canvas-drama-asset-description" data-asset-id="${escapeAttr(asset.id)}">保存</button><input type="file" data-canvas-drama-asset-fixed-image-file data-asset-id="${escapeAttr(asset.id)}" accept="image/*" hidden /><button type="button" data-action="trigger-canvas-drama-asset-fixed-image-upload" aria-label="替换 ${escapeAttr(asset.name)} 的固定图" title="替换固定图">${renderCanvasIcon("upload")}</button>${canDeleteCanvasDramaAssets ? `<button type="button" data-action="clear-canvas-drama-asset-fixed-image" data-asset-id="${escapeAttr(asset.id)}">解绑</button><button type="button" class="danger" data-action="delete-canvas-drama-asset" data-asset-id="${escapeAttr(asset.id)}" aria-label="删除 ${escapeAttr(asset.name)}" title="删除 ${escapeAttr(asset.name)}">${renderCanvasIcon("trash")}</button>` : ""}</div></div>
            </article>`).join("")}</div>` : `<p class="canvas-drama-asset-empty">选择剧集后在此查看角色、场景和道具。</p>`}
          </section>` : ""}` : ""}
          ${sidebarMode === "assets" && canvasAssetSource !== "outputs" ? `<div class="canvas-asset-media-filters" role="tablist" aria-label="资产媒体类型">
            ${[["all", "全部"], ["image", "图片"], ["video", "视频"], ["audio", "音频"]].map(([id, label]) => `<button type="button" role="tab" class="${canvasAssetMediaFilter === id ? "active" : ""}" aria-selected="${canvasAssetMediaFilter === id}" data-action="set-canvas-asset-media-filter" data-canvas-asset-media-filter="${id}">${label}</button>`).join("")}
          </div>` : ""}
          ${sidebarMode === "assets" && canvasAssetSource !== "outputs" && canvasAssetTags.length ? `<div class="canvas-asset-tag-filters" role="list" aria-label="资产标签">
            <button type="button" class="${canvasAssetTagFilter ? "" : "active"}" data-action="set-canvas-asset-tag-filter" data-canvas-asset-tag="">全部</button>
            ${canvasAssetTags.map((tag) => `<button type="button" class="${canvasAssetTagFilter === tag ? "active" : ""}" data-action="set-canvas-asset-tag-filter" data-canvas-asset-tag="${escapeAttr(tag)}">${escapeHtml(tag)}</button>`).join("")}
          </div>` : ""}
          ${sidebarMode === "assets" ? `<div class="canvas-asset-layout-controls" aria-label="资产瀑布流列数">
            <span>列数</span>
            <button type="button" data-action="set-canvas-asset-layout-columns" data-canvas-asset-layout-columns="-1" aria-label="减少资产列数" title="减少列数" ${canvasAssetLayoutColumns <= 2 ? "disabled" : ""}>-</button>
            <output aria-live="polite">${canvasAssetLayoutColumns}</output>
            <button type="button" data-action="set-canvas-asset-layout-columns" data-canvas-asset-layout-columns="1" aria-label="增加资产列数" title="增加列数" ${canvasAssetLayoutColumns >= 6 ? "disabled" : ""}>+</button>
          </div>` : ""}
          ${sidebarMode === "assets" && canvasAssetSource === "project" ? `<label class="canvas-asset-project-select"><span>项目</span><select data-canvas-asset-project aria-label="选择项目文件来源" ${canvasAssetProjects.length ? "" : "disabled"}>
            ${canvasAssetProjects.length ? canvasAssetProjects.map((project) => `<option value="${escapeAttr(project.id)}" ${project.id === canvasAssetProjectId ? "selected" : ""}>${escapeHtml(project.name)}</option>`).join("") : `<option value="">${ui.canvasAssetProjectsLoading ? "正在读取项目..." : "暂无可用项目"}</option>`}
          </select></label><div class="canvas-project-asset-tools" aria-label="导入项目文件">
            <input type="file" data-canvas-project-asset-file accept="image/*,video/*" hidden />
            <button type="button" data-action="trigger-canvas-project-asset-upload" aria-label="导入项目文件" title="导入项目文件" ${canvasAssetProjectId ? "" : "disabled"}>${renderCanvasIcon("plus")}</button>
          </div>` : ""}
          ${sidebarMode === "history" ? `<div class="canvas-history-filter-row">
            <select data-canvas-history-filter aria-label="筛选输出历史">
              ${CANVAS_HISTORY_FILTER_OPTIONS.map((option) => `<option value="${option.id}" ${normalizeCanvasHistoryFilter(ui.canvasHistoryFilter) === option.id ? "selected" : ""}>${option.label}</option>`).join("")}
            </select>
            <span class="canvas-history-actions">
              <button class="canvas-history-export" type="button" data-action="export-canvas-generation-history" aria-label="导出生成历史" title="导出生成历史">${renderCanvasIcon("download")}</button>
              <button class="canvas-history-export danger" type="button" data-action="delete-all-canvas-generation-history" aria-label="清空生成历史" title="清空生成历史">${renderCanvasIcon("trash")}</button>
            </span>
          </div>` : assetSidebarMode ? `<span class="canvas-history-actions">
            <button class="canvas-history-export" type="button" data-action="export-canvas-generation-history" aria-label="导出生成历史" title="导出生成历史">${renderCanvasIcon("download")}</button>
            <button class="canvas-history-export" type="button" data-action="delete-canvas-node-generation-history" data-node-key="${escapeAttr(selectedNode?.id ?? "")}" aria-label="删除当前节点生成历史" title="删除当前节点生成历史" ${selectedNode?.id ? "" : "disabled"}>${renderCanvasIcon("trash")}</button>
            <button class="canvas-history-export danger" type="button" data-action="delete-all-canvas-generation-history" aria-label="清空生成历史" title="清空生成历史">${renderCanvasIcon("trash")}</button>
          </span>` : `<select class="canvas-filter-select" data-canvas-node-filter aria-label="筛选画布节点">${renderCanvasNodeFilterOptions(canvasNodeFilter)}</select>`}
          ${assetSidebarMode
            ? `<label class="canvas-asset-search"><span aria-hidden="true">${renderCanvasIcon("search")}</span><input type="search" value="${escapeAttr(ui.canvasAssetSearch ?? "")}" data-canvas-asset-search aria-label="${sidebarMode === "history" ? "搜索输出历史" : `搜索${CANVAS_ASSET_SOURCE_OPTIONS.find((option) => option.id === canvasAssetSource)?.label ?? "资产"}`}" placeholder="搜索" /></label>`
            : `<label id="canvas-node-search-region" class="canvas-asset-search"${ui.canvasNodeSearchOpen === true ? "" : ' style="display:none"'}><span aria-hidden="true">${renderCanvasIcon("search")}</span><input id="canvas-node-search-input" type="search" value="${escapeAttr(ui.canvasNodeSearch ?? "")}" data-canvas-node-search aria-label="搜索画布节点" placeholder="搜索节点" /></label><button class="canvas-search" style="display:grid" type="button" data-action="toggle-canvas-node-search" aria-label="${ui.canvasNodeSearchOpen === true ? "关闭节点搜索" : "搜索画布节点"}" aria-expanded="${ui.canvasNodeSearchOpen === true}" aria-controls="canvas-node-search-region">${renderCanvasIcon(ui.canvasNodeSearchOpen === true ? "minus" : "search")}</button>`}
        </div>
        <div class="canvas-element-list${sidebarMode === "assets" ? " is-asset-waterfall" : ""}" aria-label="${assetSidebarMode ? (sidebarMode === "history" ? "输出历史列表" : "画布产物列表") : "画布节点列表"}">
          ${sidebarItems.length
            ? sidebarMode === "history"
            ? sidebarItems.map((item) => renderCanvasHistoryRecord(item, {
                  expanded: new Set(Array.isArray(ui.canvasHistoryExpandedIds) ? ui.canvasHistoryExpandedIds : []).has(String(item?.id ?? "")),
                  node: nodes.find((node) => String(node?.id ?? "") === String(item?.nodeKey ?? "")),
                })).join("")
              : canvasAssetSource === "outputs"
                ? sidebarItems.map((item) => renderCanvasSidebarItem(item, item.id === selectedNode?.id, {
                    tagEditorKey: `outputs:${item.id}`,
                    activeTagEditorKey: String(ui.canvasAssetTagEditorKey ?? ""),
                  })).join("")
                : sidebarAssets.map((item) => renderCanvasLibraryAssetItem(item, {
                    canDelete: canvasAssetSource === "global" ? canManageGlobalCanvasAssets : canvasAssetSource === "project",
                    deleteAction: canvasAssetSource === "project" ? "delete-canvas-project-asset" : "delete-canvas-global-asset",
                    canEditDetails: canvasAssetSource === "project",
                    canReplaceMedia: canvasAssetSource === "project",
                    detailDraft: ui.canvasProjectAssetEdits?.[item.assetId] ?? null,
                    canEditTags: canvasAssetSource === "global" ? canManageGlobalCanvasAssets : true,
                    canMoveToFolder: canvasAssetSource === "global" && canManageGlobalCanvasAssets,
                    tagEditAction: canvasAssetSource === "global" ? "edit-canvas-global-asset-tags" : undefined,
                    tagSource: canvasAssetSource,
                    tagEditorKey: `${canvasAssetSource}:${item.id}`,
                    activeTagEditorKey: String(ui.canvasAssetTagEditorKey ?? ""),
                    canSaveToGlobal: canvasAssetSource === "project" && item?.kind === "image" && Boolean(item?.assetVersionId),
                    canUseAsStyleReference: ((canvasAssetSource === "project" || canvasAssetSource === "drama") && item?.kind === "image" && Boolean(item?.assetVersionId)) || (canvasAssetSource === "global" && item?.kind === "image" && Boolean(item?.storageObjectId)),
                    styleReferenceBusy: String(ui.canvasStyleReferenceMaterializingAssetId ?? "") === String(item?.id ?? ""),
                  })).join("")
            : `<p class="canvas-empty-copy">${sidebarMode === "history" ? (ui.canvasAssetsLoading ? "正在加载输出历史..." : ui.canvasAssetsError ? `加载失败：${escapeHtml(ui.canvasAssetsError)}` : "暂无输出历史。运行节点后会在这里显示。") : assetSidebarMode ? (canvasAssetSource === "project" && ui.canvasAssetProjectAssetsLoading ? "正在加载资产..." : ui.canvasLibraryAssetsLoading && canvasAssetSource === "global" ? "正在加载资产..." : ui.canvasAssetProjectAssetsError && canvasAssetSource === "project" ? `加载失败：${escapeHtml(ui.canvasAssetProjectAssetsError)}` : ui.canvasLibraryAssetsError && canvasAssetSource === "global" ? `加载失败：${escapeHtml(ui.canvasLibraryAssetsError)}` : canvasAssetSource === "outputs" ? "暂无生成产物。运行节点后可从这里拖入或复用。" : "暂无可用资产。") : nodes.length ? "没有匹配的画布节点。" : "暂无画布节点。"}</p>`}
          ${assetSidebarMode && ui.canvasHistoryNextCursor ? `<button class="canvas-history-load-more" type="button" data-action="load-more-canvas-generation-history" ${ui.canvasAssetsLoading ? "disabled" : ""}>${ui.canvasAssetsLoading ? "正在加载" : "加载更多"}</button>` : ""}
          ${hasMoreCanvasAssets ? `<div class="canvas-asset-load-sentinel" data-canvas-asset-load-more-sentinel data-canvas-asset-total="${allSidebarAssets.length}" aria-live="polite">加载更多…</div>` : ""}
          ${sidebarMode !== "history" ? `<section class="canvas-template-section" aria-label="节点模板">
            <header>
              <span>节点模板</span>
              <small>${nodeTemplates.length} 个</small>
            </header>
            <div class="canvas-template-grid">
              ${nodeTemplates.map((template) => renderCanvasTemplateButton(template)).join("")}
            </div>
          </section>` : ""}
        </div>
        <footer class="canvas-sidebar-footer">
          <span${!assetSidebarMode ? ' data-canvas-node-count' : ""}>${assetSidebarMode ? `共 ${sidebarMode === "history" ? sidebarItems.length : (sidebarMode === "assets" ? `${sidebarAssets.length} / ${allSidebarAssets.length}` : sidebarItems.length)} ${sidebarMode === "history" ? "条记录" : "项"}` : `显示 ${sidebarItems.length} / ${nodes.length} 节点`}</span>
        </footer>
      </aside>
      <main class="canvas-stage ${viewport.interactionMode === "hand" ? "is-canvas-hand-mode" : "is-canvas-move-mode"} ${canvasGridVisible ? "is-canvas-grid-visible" : ""} ${canvasEdgesHidden ? "is-canvas-edges-hidden" : ""}" aria-label="自由生成画布" style="${escapeAttr(gridStyle)}">
        <button class="canvas-detail-back" type="button" data-action="back-to-canvas-projects" aria-label="返回画布项目列表">
          ${renderCanvasIcon("collapse")}<span>项目</span>
        </button>
        <div class="canvas-x6-mount" data-canvas-x6-mount aria-label="可拖拽连线画布"></div>
        <div class="canvas-flow" aria-label="AI 节点工作流" style="${escapeAttr(viewportStyle)}">
          ${renderLiblibCanvasEdges(visibleCanvasDocument, { edgeStyle: canvasEdgeStyle })}
          ${nodes.map((node) => renderLiblibCanvasNode(node, {
            selected: node.id === selectedNode?.id,
            activeTextToolbar: ui.editingCanvasTextNodeId === node.id,
            canvasDocument,
            canvasAssets,
            generatingNodeId: generatingCanvasNodeId,
          })).join("")}
          ${nodes.length === 0 ? renderCanvasEmptyQuickStart(nodeTemplates) : ""}
          ${selectedNode && !selectedNodeGenerating ? renderCanvasNodeToolbar(selectedNode) : ""}
          ${selectedNode && ui.canvasEditorOpen === true && !selectedNodeGenerating ? renderLiblibCanvasEditor(selectedNode, { modelOptionHtml: selectedModelOptionHtml, modelMenuHtml: selectedCanvasModelMenu, parameterControlHtml: selectedCanvasModelControls, canvasDocument, selectedModel: selectedCanvasModel, promptReferencePreviews: ui.canvasPromptReferencePreviews }) : ""}
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
        ${markdownFullscreenNode ? renderCanvasMarkdownFullscreen(markdownFullscreenNode, {
          open: true,
          fullscreenViewMode: markdownFullscreenState.viewMode,
          copied: markdownFullscreenState.copied === true,
          renderPreview: renderCanvasMarkdownPreview,
        }) : ""}
        ${videoFullscreenNode ? renderCanvasVideoFullscreen(videoFullscreenNode, {
          open: true,
          assets: canvasAssets,
        }) : ""}

        ${contextMenu ? renderCanvasContextMenu(contextMenu, { episodeGenerationConfig: ui.episodeGenerationConfig }) : ""}

        ${scriptPicker ? renderCanvasScriptPicker(scriptPicker) : ""}

        <div class="canvas-zoom-tools" aria-label="画布视图工具">
          <button type="button" class="canvas-view-tool is-wide ${sidebarCollapsed ? "" : "active"}" data-action="toggle-canvas-sidebar" aria-label="${sidebarCollapsed ? "展开资产管理" : "收起资产管理"}" title="资产管理" aria-expanded="${!sidebarCollapsed}" aria-controls="canvas-sidebar-panel">${renderCanvasIcon("panel")}<span>资产管理</span></button>
          <button type="button" class="canvas-view-tool" data-action="arrange-canvas-nodes" aria-label="整理画布" title="整理画布（Alt+Shift+F）">${renderCanvasIcon("grid")}</button>
          <button type="button" class="canvas-view-tool ${ui.canvasMinimapHidden === true ? "" : "active"}" data-action="toggle-canvas-minimap" aria-label="${ui.canvasMinimapHidden === true ? "显示画布小地图" : "隐藏画布小地图"}" title="画布小地图">${renderCanvasIcon("map")}</button>
          <button type="button" class="canvas-view-tool ${canvasEdgesHidden ? "" : "active"}" data-action="toggle-canvas-edges" aria-label="${canvasEdgesHidden ? "显示节点连线" : "隐藏节点连线"}" title="${canvasEdgesHidden ? "显示节点连线" : "隐藏节点连线"}">${renderCanvasIcon("connections")}</button>
          <button type="button" class="canvas-view-tool ${canvasSnapEnabled ? "active" : ""}" data-action="toggle-canvas-snap" data-viewport-patch="toggle-snap" aria-label="${canvasSnapEnabled ? "关闭网格吸附" : "开启网格吸附"}" title="网格吸附">${renderCanvasIcon("magnet")}</button>
          <button type="button" class="${canvasEdgeStyle === "orthogonal" ? "active" : ""}" data-action="set-canvas-edge-style" data-edge-style="${canvasEdgeStyle === "orthogonal" ? "curve" : "orthogonal"}" aria-label="${canvasEdgeStyle === "orthogonal" ? "切换为曲线连线" : "切换为直角连线"}" title="${canvasEdgeStyle === "orthogonal" ? "连线类型：直角 → 曲线" : "连线类型：曲线 → 直角"}">${renderCanvasIcon("edge")}</button>
          <div class="canvas-zoom-menu-shell">
            <button type="button" class="canvas-zoom-trigger ${zoomMenuOpen ? "active" : ""}" data-action="toggle-canvas-zoom-menu" data-canvas-zoom-trigger aria-label="画布缩放比例 ${zoomPercent}%" title="画布缩放" aria-haspopup="menu" aria-expanded="${zoomMenuOpen}" aria-controls="canvas-zoom-menu">${zoomPercent}%</button>
            ${zoomMenuOpen ? `
              <div class="canvas-zoom-menu" id="canvas-zoom-menu" role="menu" aria-label="画布缩放">
                <label class="canvas-zoom-menu-value" aria-label="当前缩放比例">
                  <input type="number" min="10" max="800" step="1" value="${zoomPercent}" data-canvas-zoom-value-input />
                  <span>%</span>
                </label>
                <button type="button" role="menuitem" data-action="set-canvas-viewport" data-viewport-patch="zoom-in" title="放大画布"><span>放大</span><kbd>Ctrl +</kbd></button>
                <button type="button" role="menuitem" data-action="set-canvas-viewport" data-viewport-patch="zoom-out" title="缩小画布"><span>缩小</span><kbd>Ctrl -</kbd></button>
                <button type="button" role="menuitem" data-action="fit-canvas-view" title="适合屏幕"><span>适合屏幕</span><kbd>Ctrl 0</kbd></button>
                <div class="canvas-zoom-menu-separator" role="separator"></div>
                <button type="button" role="menuitem" data-action="set-canvas-viewport" data-viewport-patch="zoom-value" data-viewport-value="50" title="缩放至50%">缩放至50%</button>
                <button type="button" role="menuitem" data-action="set-canvas-viewport" data-viewport-patch="zoom-value" data-viewport-value="100" title="缩放至100%">缩放至100%</button>
                <button type="button" role="menuitem" data-action="set-canvas-viewport" data-viewport-patch="zoom-value" data-viewport-value="800" title="缩放至800%">缩放至800%</button>
              </div>
            ` : ""}
          </div>
        </div>
        ${renderInlineStatusToast(ui, "canvas-inline-toast")}
        ${renderCanvasPromptReferencePicker(ui)}
        ${revisionConflict}
      </main>
    </section>
  `;
}

function renderCanvasRevisionConflict(conflict) {
  if (!conflict || typeof conflict !== "object") return "";
  const localSummary = summarizeCanvasRevisionDocument(conflict.localDocument);
  const serverSummary = summarizeCanvasRevisionDocument(conflict.serverDocument);
  return `
    <div class="canvas-revision-conflict-backdrop" role="presentation">
      <section class="canvas-revision-conflict" role="alertdialog" aria-modal="true" aria-labelledby="canvas-revision-conflict-title" aria-describedby="canvas-revision-conflict-description">
        <header>
          <span class="canvas-revision-conflict-mark" aria-hidden="true">!</span>
          <div>
            <h2 id="canvas-revision-conflict-title">画布版本发生冲突</h2>
            <p id="canvas-revision-conflict-description">当前画布已被修改，请确认是否保存到最新版本。</p>
          </div>
        </header>
        <div class="canvas-revision-conflict-compare" aria-label="版本摘要">
          ${renderCanvasRevisionSummary("本地草稿", conflict.clientRevision, localSummary, "尚未保存的编辑")}
          ${renderCanvasRevisionSummary("服务端版本", conflict.serverRevision, serverSummary, "其他位置已保存")}
        </div>
        <footer>
          <button type="button" class="canvas-revision-choice secondary" data-action="resolve-canvas-revision-conflict" data-canvas-conflict-version="server">使用服务端版本</button>
          <button type="button" class="canvas-revision-choice primary" data-action="resolve-canvas-revision-conflict" data-canvas-conflict-version="local">保留本地版本并保存</button>
        </footer>
      </section>
    </div>
  `;
}

function renderCanvasRevisionSummary(label, revision, summary, note) {
  return `
    <article class="canvas-revision-summary">
      <div class="canvas-revision-summary-title">
        <strong>${escapeHtml(label)}</strong>
        <span>Revision ${escapeHtml(String(Number(revision ?? 0) || 0))}</span>
      </div>
      <dl>
        <div><dt>节点</dt><dd>${summary.nodeCount}</dd></div>
        <div><dt>连接</dt><dd>${summary.edgeCount}</dd></div>
      </dl>
      <p>${escapeHtml(summary.nodeLabels || "空白画布")}</p>
      <small>${escapeHtml(note)}</small>
    </article>
  `;
}

function summarizeCanvasRevisionDocument(document) {
  const nodes = Array.isArray(document?.nodes) ? document.nodes : [];
  const edges = Array.isArray(document?.edges) ? document.edges : [];
  const nodeLabels = nodes
    .map((node) => String(node?.data?.title ?? node?.data?.name ?? node?.data?.text ?? node?.type ?? "节点").trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((label) => label.length > 28 ? `${label.slice(0, 28)}...` : label)
    .join("、");
  return { nodeCount: nodes.length, edgeCount: edges.length, nodeLabels };
}

/**
 * Render only the standalone Canvas surface for the in-app host.
 * The production workbench remains the source of truth for Canvas markup;
 * the host owns lifecycle, styling scope, and dependency injection.
 */
export function renderCanvasSurfaceForHost(context = {}) {
  const state = context?.state && typeof context.state === "object" ? context.state : {};
  const ui = context?.ui && typeof context.ui === "object" ? context.ui : {};
  const session = context?.session && typeof context.session === "object"
    ? context.session
    : { user: { phone: "" } };
  return `${renderToolsPanel({ ...ui, session, canvasProjectView: "detail" }, state, session)}
    ${renderCanvasDirectorCaptureDeleteModal(ui.canvasDirectorCaptureDeleteTarget)}`;
}

export function renderCanvasProjectGallery(ui = {}) {
  const allProjects = normalizeCanvasProjectCards(ui);
  const statusFilter = ["active", "archived", "all"].includes(ui.canvasProjectStatusFilter)
    ? ui.canvasProjectStatusFilter
    : "active";
  const statusProjects = statusFilter === "all"
    ? allProjects
    : allProjects.filter((project) => statusFilter === "archived"
      ? normalizeCanvasProjectCardStatus(project.status) === "archived"
      : normalizeCanvasProjectCardStatus(project.status) !== "archived");
  const searchQuery = String(ui.canvasProjectSearchQuery ?? "").trim().toLocaleLowerCase();
  const projects = searchQuery
    ? statusProjects.filter((project) => `${project.title ?? ""} ${project.id ?? ""}`.toLocaleLowerCase().includes(searchQuery))
    : statusProjects;
  const pageSize = CANVAS_PROJECT_GALLERY_PAGE_SIZE;
  const totalProjects = projects.length;
  const totalPages = Math.max(1, Math.ceil(totalProjects / pageSize));
  const currentPage = Math.min(Math.max(1, Number(ui.canvasProjectPage ?? 1) || 1), totalPages);
  const visibleProjects = totalProjects <= pageSize
    ? projects
    : projects.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const isTeamMember = isTeamMemberSession(ui.session);
  const canCreateCanvasProject = !isTeamMember;
  return `
    <section class="canvas-project-gallery" aria-label="画布项目列表">
      <header class="canvas-project-gallery-head">
        <div class="page-seo-heading">
          <h1>全部画布(${escapeHtml(String(allProjects.length))})</h1>
          <div class="page-seo-tags" aria-label="画布能力">
            <b>AI视频生成工具</b>
            <b>文生视频</b>
            <b>图生视频</b>
            <b>图片生成视频</b>
            <b>AI改视频</b>
          </div>
        </div>
        <div class="canvas-project-gallery-controls">
          <label class="canvas-project-filter"><span>项目状态</span><select data-canvas-project-status-filter aria-label="筛选画布状态"><option value="active" ${statusFilter === "active" ? "selected" : ""}>使用中</option><option value="archived" ${statusFilter === "archived" ? "selected" : ""}>已归档</option><option value="all" ${statusFilter === "all" ? "selected" : ""}>全部</option></select></label>
          <label class="canvas-project-search">
            ${renderCanvasIcon("search")}
            <input type="search" value="${escapeAttr(ui.canvasProjectSearchQuery ?? "")}" data-canvas-project-search placeholder="请输入项目名称" aria-label="请输入项目名称" />
          </label>
        </div>
      </header>
      <div class="canvas-project-card-grid">
        ${visibleProjects.length
          ? visibleProjects.map((project) => renderCanvasProjectCard(project, ui.canvasProjectMenuId === project.id, !isTeamMember)).join("")
          : searchQuery
            ? `<p class="canvas-project-empty">没有匹配“${escapeHtml(String(ui.canvasProjectSearchQuery ?? "").trim())}”的画布</p>`
            : isTeamMember
              ? renderTeamMemberAssignmentEmptyState("画布")
              : ""}
      </div>
      ${totalProjects ? renderProjectGalleryPagination(totalProjects, currentPage, totalPages, pageSize, "画布分页", "change-canvas-project-page") : ""}
      <div class="canvas-project-aurora" aria-hidden="true"></div>
      ${canCreateCanvasProject
        ? `<button class="canvas-create-project-button" type="button" data-action="create-canvas-project">
            <span aria-hidden="true">${renderCanvasIcon("plus")}</span>
            创建画布
          </button>`
        : ``}
    </section>
  `;
}

function isTeamMemberSession(session) {
  return String(session?.user?.actorType ?? "").trim().toLowerCase() === "team_member";
}

function isNewCanvasEnabled(session = {}) {
  return (session?.features?.newCanvas ?? session?.user?.features?.newCanvas) !== false;
}

function hasActiveSessionUser(session = {}) {
  return session?.authenticated !== false && Boolean(session?.user?.id || session?.user?.phone);
}

function isActiveMembershipStatus(membershipStatus) {
  const status = String(
    membershipStatus?.status ??
    membershipStatus?.membership?.status ??
    membershipStatus?.subscription?.status ??
    "",
  );
  return status === "active" || status.endsWith("_active");
}

function resolveMembershipEntitlement(membershipStatus, entitlementKey) {
  const entitlements =
    membershipStatus?.entitlements ??
    membershipStatus?.membership?.entitlements ??
    membershipStatus?.subscription?.entitlements ??
    null;
  if (!entitlements || typeof entitlements !== "object") {
    return null;
  }
  return Object.prototype.hasOwnProperty.call(entitlements, entitlementKey)
    ? entitlements[entitlementKey] === true
    : null;
}

function hasCanvasAccess(membershipStatus) {
  const configuredEntitlement = resolveMembershipEntitlement(membershipStatus, "canvasAccess");
  if (configuredEntitlement !== null) {
    return configuredEntitlement === true && isActiveMembershipStatus(membershipStatus);
  }
  return false;
}

function hasTeamAssetLibraryAccess(ui = {}) {
  const configuredEntitlement = resolveMembershipEntitlement(ui.membershipStatus, "teamAssetLibrary");
  if (configuredEntitlement !== null) {
    return configuredEntitlement === true && isActiveMembershipStatus(ui.membershipStatus);
  }
  return ui.libraryEntitlement?.hasTeamAssetLibrary === true &&
    isActiveMembershipStatus(ui.membershipStatus);
}

function normalizeCanvasProjectCards(ui = {}) {
  const projects = Array.isArray(ui.canvasProjects) ? ui.canvasProjects : [];
  return projects.map((project, index) => ({
    id: String(project?.id ?? `canvas-project-${index + 1}`),
    title: String(project?.title ?? (index === 0 ? "画布项目" : `画布项目 ${index + 1}`)),
    createdAt: String(project?.createdAt ?? "2026/06/10"),
    status: String(project?.status ?? "草稿"),
  }));
}

function normalizeCanvasProjectCardStatus(value) {
  const status = String(value ?? "draft").trim().toLocaleLowerCase();
  return status === "归档" || status === "archived" ? "archived" : status;
}

function resolveRecentCanvasProjects(ui = {}) {
  const projects = normalizeCanvasProjectCards(ui);
  const projectById = new Map(projects.map((project) => [project.id, project]));
  return (Array.isArray(ui.canvasRecentProjectIds) ? ui.canvasRecentProjectIds : [])
    .map((id) => projectById.get(String(id)))
    .filter(Boolean)
    .slice(0, 5);
}

function renderCanvasProjectCard(project = {}, menuOpen = false, canDelete = true) {
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
          <small>创建时间：${escapeHtml(project.createdAt ?? "2026/06/10")} · ${normalizeCanvasProjectCardStatus(project.status) === "archived" ? "已归档" : "使用中"}</small>
          <span class="canvas-project-card-actions">
            <button class="canvas-project-menu" type="button" data-action="toggle-canvas-project-menu" data-canvas-project-id="${escapeAttr(project.id ?? "")}" aria-label="${escapeAttr(project.title ?? "画布项目")}编辑">编辑</button>
            ${menuOpen ? renderCanvasProjectMenu(project, canDelete) : ""}
          </span>
        </div>
      </div>
    </article>
  `;
}

function renderCanvasProjectMenu(project = {}, canDelete = true) {
  const archived = normalizeCanvasProjectCardStatus(project.status) === "archived";
  return `
    <div class="canvas-project-card-menu" role="menu" aria-label="画布操作">
      <button class="canvas-project-card-menu-item" type="button" data-action="rename-canvas-project" data-canvas-project-id="${escapeAttr(project.id ?? "")}">重命名</button>
      ${canDelete ? `<button class="canvas-project-card-menu-item" type="button" data-action="toggle-canvas-project-archive" data-canvas-project-id="${escapeAttr(project.id ?? "")}" data-canvas-project-status="${archived ? "active" : "archived"}">${archived ? "恢复" : "归档"}</button>` : ""}
      ${canDelete ? `<button class="canvas-project-card-menu-item danger" type="button" data-action="delete-canvas-project" data-canvas-project-id="${escapeAttr(project.id ?? "")}">删除</button>` : ""}
    </div>
  `;
}

const CANVAS_TOOLBAR_TOOLS = Object.freeze({
  select: { label: "选择", icon: "cursor", action: "set-canvas-tool", attrs: 'data-canvas-tool="select"' },
  connect: { label: "连接", icon: "link", action: "set-canvas-tool", attrs: 'data-canvas-tool="connect"' },
  undo: { label: "撤销", icon: "undo", action: "undo-canvas-change" },
  redo: { label: "重做", icon: "redo", action: "redo-canvas-change" },
  copy: { label: "复制节点", icon: "copy", action: "copy-canvas-selection" },
  paste: { label: "粘贴节点", icon: "clipboard", action: "paste-canvas-selection" },
  group: { label: "节点分组", icon: "group", action: "group-canvas-selection" },
  ungroup: { label: "取消分组", icon: "group", action: "ungroup-canvas-selection" },
});

const DEFAULT_CANVAS_TOOLBAR_ZONES = Object.freeze([
  Object.freeze(["undo", "redo"]),
  Object.freeze(["copy", "paste", "group"]),
]);

export function resolveCanvasToolbarLayout(ui = {}) {
  const manifest = ui.canvasConfigSnapshots?.toolbar?.manifest;
  const configuredIds = Array.isArray(manifest?.toolIds)
    ? manifest.toolIds.map(String).filter((id) => CANVAS_TOOLBAR_TOOLS[id])
    : [];
  const layout = manifest?.layout;
  const configuredZones = Array.isArray(layout?.zones)
    ? layout.zones.map((zone) => {
        const ids = Array.isArray(zone)
          ? zone
          : Array.isArray(zone?.toolIds) ? zone.toolIds : Array.isArray(zone?.buttonKeys) ? zone.buttonKeys : [];
        return ids.map(String).filter((id) => CANVAS_TOOLBAR_TOOLS[id] && (!configuredIds.length || configuredIds.includes(id)));
      }).filter((zone) => zone.length)
    : [];
  const zones = configuredZones.length
    ? configuredZones
    : configuredIds.length ? [configuredIds] : DEFAULT_CANVAS_TOOLBAR_ZONES.map((zone) => [...zone]);
  const directionValue = typeof layout === "string" ? layout : layout?.direction ?? layout?.orientation;
  const direction = directionValue === "vertical" ? "vertical" : "horizontal";
  const position = ["top-left", "top-center", "top-right", "left", "right"].includes(layout?.position)
    ? layout.position
    : "top-left";
  return { zones, direction, position, configured: Boolean(configuredIds.length) };
}

function renderCanvasCommandToolbar(ui = {}) {
  const layout = resolveCanvasToolbarLayout(ui);
  const activeTool = String(ui.canvasActiveTool ?? "select");
  return `<div class="canvas-command-tools" role="toolbar" aria-label="画布编辑工具" data-toolbar-layout="${layout.direction}" data-toolbar-position="${layout.position}" data-toolbar-configured="${layout.configured}">
    ${layout.zones.map((zone, zoneIndex) => `${zoneIndex ? '<span aria-hidden="true"></span>' : ""}${zone.map((id) => {
      const tool = CANVAS_TOOLBAR_TOOLS[id];
      const active = tool.action === "set-canvas-tool" && activeTool === id;
      return `<button class="${active ? "active" : ""}" type="button" data-action="${tool.action}" ${tool.attrs ?? ""} aria-label="${escapeAttr(tool.label)}" title="${escapeAttr(tool.label)}"${tool.action === "set-canvas-tool" ? ` aria-pressed="${active}"` : ""}>${renderCanvasIcon(tool.icon)}</button>`;
    }).join("")}`).join("")}
  </div>`;
}

const CANVAS_NODE_FILTER_LABELS = {
  all: "全部",
  source: "输入",
  text: "文本",
  image: "图片",
  video: "视频",
  audio: "音频",
};

function normalizeCanvasNodeFilter(value) {
  const normalized = String(value ?? "all");
  return Object.hasOwn(CANVAS_NODE_FILTER_LABELS, normalized) ? normalized : "all";
}

function renderCanvasNodeFilterOptions(activeFilter) {
  return Object.entries(CANVAS_NODE_FILTER_LABELS)
    .map(([value, label]) => `<option value="${value}" ${value === activeFilter ? "selected" : ""}>${label}</option>`)
    .join("");
}

function filterCanvasSidebarNodeItems(items, filter, query) {
  const sourceKinds = new Set(["upload", "source-file", "source-image", "source-video", "source-audio"]);
  const textKinds = new Set(["script", "source-text", "text", "ai-text", "ai-markdown", "ai-storyboard", "ai-director", "markdown", "comment", "group"]);
  const imageKinds = new Set(["image", "send", "ai-image", "ai-animation", "ai-panorama"]);
  const videoKinds = new Set(["video", "ai-video"]);
  const audioKinds = new Set(["audio", "ai-audio"]);
  const kindsByFilter = { source: sourceKinds, text: textKinds, image: imageKinds, video: videoKinds, audio: audioKinds };
  return (Array.isArray(items) ? items : []).filter((item) => {
    const kind = String(item?.kind ?? "").toLowerCase();
    if (filter !== "all" && !kindsByFilter[filter]?.has(kind)) {
      return false;
    }
    return !query || [item?.title, item?.meta, item?.kind, item?.status]
      .some((value) => String(value ?? "").toLocaleLowerCase().includes(query));
  });
}

function renderCanvasEmptyQuickStart(templates = []) {
  const preferredTypes = ["ai-text", "ai-image", "ai-video", "ai-audio"];
  const quickStarts = preferredTypes
    .map((type) => templates.find((template) => template.type === type))
    .filter(Boolean);
  if (!quickStarts.length) return "";
  return `<section class="canvas-empty-quick-start" aria-label="快速开始">
    <strong>从一个创作节点开始</strong>
    <div>${quickStarts.map((template) => `<button type="button" data-action="add-canvas-template" data-template-id="${escapeAttr(template.id)}" data-node-kind="${escapeAttr(template.type)}"><span aria-hidden="true">${renderCanvasIcon(template.type)}</span><span>${escapeHtml(template.title)}</span></button>`).join("")}</div>
  </section>`;
}

function normalizeCanvasAssetSource(value) {
  const normalized = String(value ?? "outputs").trim().toLowerCase();
  return CANVAS_ASSET_SOURCE_OPTIONS.some((option) => option.id === normalized) ? normalized : "outputs";
}

function resolveCanvasLibraryAssets(ui = {}, state = {}, source = "outputs") {
  if (source === "outputs") return [];
  if (source === "global") return Array.isArray(ui.canvasLibraryAssets) ? ui.canvasLibraryAssets : [];
  if (source === "project" && Array.isArray(ui.canvasAssetProjectAssets)) {
    return ui.canvasAssetProjectAssets;
  }
  const assetsByType = source === "drama"
    ? ui.importedAssets ?? ui.projectDetail?.assetsByType ?? state.projectDetail?.assetsByType ?? {}
    : ui.projectLibraryAssetsByType ?? ui.projectDetail?.assetsByType ?? state.projectDetail?.assetsByType ?? {};
  if (!assetsByType || typeof assetsByType !== "object") {
    return source === "global" && Array.isArray(ui.canvasLibraryAssets) ? ui.canvasLibraryAssets : [];
  }
  const entries = [];
  for (const [category, value] of Object.entries(assetsByType)) {
    const list = Array.isArray(value)
      ? value
      : value && typeof value === "object"
        ? Object.values(value).flatMap((item) => Array.isArray(item) ? item : [])
        : [];
    for (const asset of list) {
      const normalized = normalizeCanvasLibraryAsset(asset, { source, category });
      if (normalized) entries.push(normalized);
    }
  }
  return entries;
}

  export function normalizeCanvasLibraryAsset(asset, { source = "project", category = "image" } = {}) {
  if (!asset || typeof asset !== "object") return null;
  const id = String(asset.id ?? asset.assetId ?? asset.assetKey ?? "").trim();
  if (!id) return null;
  const latestVersion = asset.latestVersion && typeof asset.latestVersion === "object" ? asset.latestVersion : {};
  const metadata = latestVersion.metadata && typeof latestVersion.metadata === "object" ? latestVersion.metadata : {};
  const mediaType = String(asset.mediaType ?? asset.mimeType ?? metadata.mimeType ?? category).toLowerCase();
  const kind = mediaType.includes("video") || category === "video" ? "video" : mediaType.includes("audio") || category === "audio" || category === "voice" ? "audio" : "image";
  const previewUrl = String(
    asset.previewUrl ?? asset.preview ?? asset.sourceUrl ?? latestVersion.previewUrl ?? metadata.previewUrl ?? metadata.fixedImageUrl ?? "",
  ).trim();
  return {
    id: `library:${source}:${id}`,
    sourceAssetId: id,
    source,
    kind,
    title: String(asset.name ?? asset.label ?? asset.assetKey ?? "未命名资产"),
    meta: `${source === "global" ? "全局" : source === "drama" ? "短剧" : "项目"} · ${category}`,
      tags: Array.isArray(asset.tags)
      ? [...new Set(asset.tags.map((tag) => String(tag ?? "").trim()).filter(Boolean))]
      : Array.isArray(metadata.tags)
        ? [...new Set(metadata.tags.map((tag) => String(tag ?? "").trim()).filter(Boolean))]
          : [],
      folderName: String(asset.folderName ?? asset.folder_name ?? "").trim(),
    status: "可用",
    url: previewUrl,
    previewUrl,
    storageObjectId: String(asset.storageObjectId ?? latestVersion.storageObjectId ?? metadata.storageObjectId ?? "").trim() || null,
    assetId: id,
    assetVersionId: String(asset.assetVersionId ?? latestVersion.id ?? "").trim() || null,
  };
}

function renderCanvasAssetTagEditor(asset, { source, editorKey, activeEditorKey } = {}) {
  if (!editorKey || editorKey !== activeEditorKey) return "";
  const tags = Array.isArray(asset?.tags) ? asset.tags : [];
  return `<div class="canvas-asset-tag-editor" role="group" aria-label="编辑 ${escapeAttr(asset?.title ?? "资产")} 的标签">
    ${tags.map((tag) => `<button type="button" data-action="remove-canvas-library-asset-tag" data-library-asset-id="${escapeAttr(asset?.id ?? "")}" data-asset-source="${escapeAttr(source ?? "")}" data-canvas-asset-tag="${escapeAttr(tag)}" aria-label="删除标签 ${escapeAttr(tag)}" title="删除标签 ${escapeAttr(tag)}">${escapeHtml(tag)} <b aria-hidden="true">×</b></button>`).join("")}
    <input type="text" data-canvas-asset-tag-input data-canvas-asset-editor-key="${escapeAttr(editorKey)}" data-library-asset-id="${escapeAttr(asset?.id ?? "")}" data-asset-source="${escapeAttr(source ?? "")}" maxlength="32" aria-label="新增标签" placeholder="输入标签后按 Enter" />
  </div>`;
}

function renderCanvasMediaPreview(kind, url, { poster = "", alt = "" } = {}) {
  const normalizedKind = String(kind ?? "").trim().toLowerCase();
  const safeUrl = String(url ?? "").trim();
  if (!safeUrl) return "";
  if (normalizedKind === "video") {
    const safePoster = String(poster ?? "").trim();
    return `<video src="${escapeAttr(safeUrl)}"${safePoster && safePoster !== safeUrl ? ` poster="${escapeAttr(safePoster)}"` : ""} muted playsinline preload="metadata" aria-label="${escapeAttr(alt || "视频预览")}"></video>`;
  }
  if (normalizedKind === "audio") {
    return `<audio src="${escapeAttr(safeUrl)}" controls preload="metadata" aria-label="${escapeAttr(alt || "音频预览")}"></audio>`;
  }
  return `<img src="${escapeAttr(safeUrl)}" alt="${escapeAttr(alt)}" loading="lazy" />`;
}

  function renderCanvasLibraryAssetItem(asset, { canDelete = false, deleteAction = "delete-canvas-global-asset", canEditDetails = false, canReplaceMedia = false, detailDraft = null, canEditTags = false, canMoveToFolder = false, canSaveToGlobal = false, canUseAsStyleReference = false, styleReferenceBusy = false, tagEditAction = "edit-canvas-library-asset-tags", tagSource = "", tagEditorKey = "", activeTagEditorKey = "" } = {}) {
  const title = String(asset?.title ?? "未命名资产");
  const preview = String(asset?.url ?? asset?.previewUrl ?? "").trim();
  return `<div class="canvas-library-asset-item" data-canvas-asset-drag="true" data-asset-id="${escapeAttr(asset?.id ?? "")}" draggable="true">
    <button class="canvas-element-item asset" type="button" data-action="add-canvas-library-asset" data-library-asset-id="${escapeAttr(asset?.id ?? "")}">
      <span class="canvas-element-icon" aria-hidden="true">${preview ? renderCanvasMediaPreview(asset?.kind, preview, { poster: asset?.posterUrl, alt: title }) : renderCanvasIcon(asset?.kind ?? "image")}</span>
      <span class="canvas-element-copy"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(asset?.meta ?? "资产")}</small></span>
      ${Array.isArray(asset?.tags) && asset.tags.length ? `<span class="canvas-library-asset-tags">${asset.tags.map((tag) => `<em>${escapeHtml(tag)}</em>`).join("")}</span>` : ""}
      <i>${escapeHtml(asset?.status ?? "可用")}</i>
    </button>
      ${canEditDetails ? `<div class="canvas-library-asset-details"><input type="text" data-canvas-project-asset-detail data-asset-id="${escapeAttr(asset?.assetId ?? "")}" data-field="name" value="${escapeAttr(detailDraft?.name ?? title)}" maxlength="120" aria-label="${escapeAttr(title)} 名称" /><input type="text" data-canvas-project-asset-detail data-asset-id="${escapeAttr(asset?.assetId ?? "")}" data-field="description" value="${escapeAttr(detailDraft?.description ?? asset?.description ?? "")}" maxlength="2000" placeholder="资产简介" aria-label="${escapeAttr(title)} 简介" /><button type="button" data-action="save-canvas-project-asset-details" data-asset-id="${escapeAttr(asset?.assetId ?? "")}">保存</button></div>` : ""}
      ${canReplaceMedia ? `<input type="file" data-canvas-project-asset-replace-file data-asset-id="${escapeAttr(asset?.assetId ?? "")}" accept="image/*,video/*,audio/*" hidden /><button type="button" data-action="trigger-canvas-project-asset-replace" aria-label="替换 ${escapeAttr(title)}" title="替换资产">${renderCanvasIcon("upload")}</button>` : ""}
      ${canEditTags ? `<button class="canvas-library-asset-edit-tags" type="button" data-action="${escapeAttr(tagEditAction)}" data-library-asset-id="${escapeAttr(asset?.id ?? "")}" data-asset-id="${escapeAttr(asset?.assetId ?? "")}" data-asset-source="${escapeAttr(tagSource)}" aria-label="编辑 ${escapeAttr(title)} 的标签" title="编辑标签">标签</button>` : ""}
      ${canMoveToFolder ? `<div class="canvas-library-asset-folder"><input type="text" data-canvas-global-asset-folder-input value="${escapeAttr(asset?.folderName ?? "")}" maxlength="64" placeholder="文件夹" aria-label="${escapeAttr(title)} 的文件夹" /><button type="button" data-action="move-canvas-global-asset-folder" data-asset-id="${escapeAttr(asset?.assetId ?? "")}">移动</button></div>` : ""}
    ${canSaveToGlobal ? `<button class="canvas-library-asset-save-global" type="button" data-action="save-canvas-project-asset-to-global" data-library-asset-id="${escapeAttr(asset?.id ?? "")}" aria-label="将 ${escapeAttr(title)} 保存到全局资产" title="保存到全局资产">保存全局</button>` : ""}
    ${canUseAsStyleReference ? `<button class="canvas-library-asset-style-reference" type="button" data-action="use-canvas-library-asset-as-style-reference" data-library-asset-id="${escapeAttr(asset?.id ?? "")}" aria-label="将 ${escapeAttr(title)} 设为风格母图" title="设为风格母图" ${styleReferenceBusy ? "disabled" : ""}>${styleReferenceBusy ? "处理中" : "风格母图"}</button>` : ""}
    ${canDelete ? `<button class="canvas-library-asset-delete" type="button" data-action="${escapeAttr(deleteAction)}" data-asset-id="${escapeAttr(asset?.assetId ?? "")}" aria-label="删除资产 ${escapeAttr(title)}" title="删除资产">${renderCanvasIcon("trash")}</button>` : ""}
    ${canEditTags ? renderCanvasAssetTagEditor(asset, { source: tagSource, editorKey: tagEditorKey, activeEditorKey: activeTagEditorKey }) : ""}
  </div>`;
}

function renderCanvasSidebarItem(item, active = false, { tagEditorKey = "", activeTagEditorKey = "" } = {}) {
  const action = item.type === "asset" ? "add-canvas-template" : "select-canvas-node";
  const dataAttrs = item.type === "asset"
    ? `data-template-id="template-upload" data-node-kind="upload" data-asset-id="${escapeAttr(item.id)}"`
    : `data-node-id="${escapeAttr(item.id)}" data-node-kind="${escapeAttr(item.kind)}"`;
  const itemButton = `
    <button class="canvas-element-item ${escapeAttr(item.kind)} ${item.type === "asset" ? "asset" : ""} ${active ? "active" : ""}" type="button" data-action="${action}" ${dataAttrs}${item.type === "asset" ? ' draggable="true" data-canvas-asset-drag="true"' : ""}>
      <span class="canvas-element-icon" aria-hidden="true">${item.url ? renderCanvasMediaPreview(item.kind, item.url, { poster: item.posterUrl, alt: item.title }) : renderCanvasIcon(item.kind)}</span>
      <span class="canvas-element-copy">
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.meta)}</small>
      </span>
      ${Array.isArray(item.tags) && item.tags.length ? `<span class="canvas-library-asset-tags">${item.tags.map((tag) => `<em>${escapeHtml(tag)}</em>`).join("")}</span>` : ""}
      <i>${escapeHtml(item.status)}</i>
    </button>
  `;
  if (item.type !== "asset") return itemButton;
  const transfer = item.transfer && typeof item.transfer === "object" ? item.transfer : null;
  const running = transfer?.status === "running";
  const failed = transfer?.status === "failed";
  const progress = Number.isFinite(Number(transfer?.progress))
    ? Math.max(0, Math.min(100, Math.round(Number(transfer.progress) * 100)))
    : null;
  const transferLabel = running
    ? `${transfer.mode === "copy" ? "复制" : "下载"} ${progress === null ? formatCanvasTransferBytes(transfer.loaded) : `${progress}%`}`
    : failed ? "传输失败，可重试" : transfer?.status === "canceled" ? "传输已取消，可重试" : transfer?.status === "succeeded" ? "传输完成" : "";
  const unavailable = item.storageObjectId ? "" : "disabled";
  return `<div class="canvas-history-item">${itemButton}<div class="canvas-asset-actions" role="group" aria-label="${escapeAttr(item.title)}资产操作">
    ${running
      ? `<button type="button" data-action="cancel-canvas-asset-transfer" data-asset-id="${escapeAttr(item.id)}" aria-label="取消${escapeAttr(transfer.mode === "copy" ? "复制" : "下载")}" title="取消传输">${renderCanvasIcon("minus")}</button>`
      : `<button type="button" data-action="copy-canvas-asset" data-asset-id="${escapeAttr(item.id)}" aria-label="复制${escapeAttr(item.title)}" title="复制到剪贴板" ${unavailable}>${renderCanvasIcon("copy")}</button>
         <button type="button" data-action="download-canvas-asset" data-asset-id="${escapeAttr(item.id)}" aria-label="下载${escapeAttr(item.title)}" title="下载资产" ${unavailable}>${renderCanvasIcon("download")}</button>`}
    ${item.artifactId ? `<button class="canvas-library-asset-edit-tags" type="button" data-action="edit-canvas-library-asset-tags" data-library-asset-id="${escapeAttr(item.id)}" data-asset-source="outputs" aria-label="编辑 ${escapeAttr(item.title)} 的标签" title="编辑标签">标签</button>` : ""}
    ${item.runId ? `<button class="canvas-history-delete" type="button" data-action="delete-canvas-generation-run" data-run-id="${escapeAttr(item.runId)}" aria-label="删除${escapeAttr(item.title)}" title="删除生成记录">${renderCanvasIcon("trash")}</button>` : ""}
  </div>${item.artifactId ? renderCanvasAssetTagEditor(item, { source: "outputs", editorKey: tagEditorKey, activeEditorKey: activeTagEditorKey }) : ""}${transferLabel ? `<div class="canvas-asset-transfer-status ${escapeAttr(transfer?.status ?? "")}" role="status"><span>${escapeHtml(transferLabel)}</span>${running ? `<progress max="1" ${progress === null ? "" : `value="${escapeAttr(Number(transfer.progress))}"`}></progress>` : ""}</div>` : ""}</div>`;
}

function normalizeCanvasHistoryFilter(value) {
  const normalized = String(value ?? "all").trim().toLowerCase();
  return CANVAS_HISTORY_FILTER_OPTIONS.some((option) => option.id === normalized) ? normalized : "all";
}

function filterCanvasHistoryItems(items, options = {}) {
  const filter = normalizeCanvasHistoryFilter(options.filter);
  const query = String(options.search ?? "").trim().toLocaleLowerCase();
  return (Array.isArray(items) ? items : []).filter((item) => {
    const mediaKind = String(item?.mediaKind ?? "").trim().toLowerCase();
    if (filter !== "all" && mediaKind !== filter) return false;
    if (!query) return true;
    const prompt = resolveCanvasHistorySnapshotText(item?.inputSnapshot, ["prompt", "text", "content"]);
    const output = resolveCanvasHistorySnapshotText(item?.outputSnapshot, ["text", "output", "content", "transcript", "result"]);
    return [item?.nodeKey, item?.modelCode, item?.status, prompt, output]
      .some((value) => String(value ?? "").toLocaleLowerCase().includes(query));
  });
}

function resolveCanvasHistorySnapshotText(snapshot, preferredKeys = []) {
  const visit = (value, depth = 0) => {
    if (depth > 4 || value == null) return "";
    if (typeof value === "string") return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) return value.map((item) => visit(item, depth + 1)).filter(Boolean).join("\n");
    if (typeof value !== "object") return "";
    const record = value;
    for (const key of preferredKeys) {
      const result = visit(record[key], depth + 1);
      if (result) return result;
    }
    return Object.values(record).map((item) => visit(item, depth + 1)).filter(Boolean).join("\n");
  };
  return visit(snapshot).slice(0, 12_000);
}

function formatCanvasHistoryTime(value) {
  const date = new Date(String(value ?? ""));
  if (!Number.isFinite(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function canvasHistoryMediaLabel(kind) {
  return CANVAS_HISTORY_FILTER_OPTIONS.find((option) => option.id === String(kind ?? "").toLowerCase())?.label ?? "输出";
}

function canvasHistoryStatusLabel(status) {
  return {
    succeeded: "成功",
    completed: "成功",
    failed: "失败",
    canceled: "已取消",
    queued: "排队中",
    running: "生成中",
  }[String(status ?? "").toLowerCase()] ?? String(status ?? "未知");
}

function renderCanvasHistoryRecord(run, options = {}) {
  const runId = String(run?.id ?? "");
  const nodeId = String(options.node?.id ?? run?.nodeKey ?? "");
  const prompt = resolveCanvasHistorySnapshotText(run?.inputSnapshot, ["prompt", "text", "content"]);
  const output = resolveCanvasHistorySnapshotText(run?.outputSnapshot, ["text", "output", "content", "transcript", "result"]);
  const failure = taskCenterFailureMessage(run);
  const artifacts = Array.isArray(run?.artifacts) ? run.artifacts : [];
  const expanded = options.expanded === true;
  const title = String(options.node?.data?.title ?? run?.nodeKey ?? "生成记录");
  const mediaLabel = canvasHistoryMediaLabel(run?.mediaKind);
  const status = canvasHistoryStatusLabel(run?.status);
  const preview = artifacts.slice(0, 4).map((rawArtifact) => {
    const artifact = rawArtifact && typeof rawArtifact === "object" ? rawArtifact : {};
    const metadata = artifact.metadata && typeof artifact.metadata === "object"
      ? artifact.metadata
      : artifact.metadata_json && typeof artifact.metadata_json === "object" ? artifact.metadata_json : {};
    const kind = String(artifact.artifactKind ?? artifact.artifact_kind ?? run?.mediaKind ?? "image").trim().toLowerCase();
    const url = String(
      kind === "video"
        ? artifact.url ?? artifact.videoUrl ?? artifact.video_url ?? metadata.videoUrl ?? metadata.video_url ?? artifact.thumbnailUrl ?? artifact.thumbnail_url ?? metadata.previewUrl ?? ""
        : artifact.thumbnailUrl ?? artifact.thumbnail_url ?? artifact.url ?? metadata.previewUrl ?? "",
    ).trim();
    const poster = String(artifact.thumbnailUrl ?? artifact.thumbnail_url ?? metadata.previewUrl ?? "").trim();
    const fallbackStorageUrl = artifact.storageObjectId || artifact.storage_object_id
      ? `/api/storage/objects/${encodeURIComponent(artifact.storageObjectId ?? artifact.storage_object_id)}/content?proxy=1`
      : "";
    const resolvedUrl = url || fallbackStorageUrl;
    return resolvedUrl
      ? renderCanvasMediaPreview(kind, resolvedUrl, { poster, alt: canvasHistoryMediaLabel(kind) })
      : `<span aria-hidden="true">${renderCanvasIcon(run?.mediaKind ?? "image")}</span>`;
  }).join("");
  return `<article class="canvas-history-record ${expanded ? "expanded" : ""}" data-canvas-history-record data-run-id="${escapeAttr(runId)}">
    <header class="canvas-history-record-header">
      <span class="canvas-history-record-icon" aria-hidden="true">${renderCanvasIcon(run?.mediaKind ?? "image")}</span>
      <span class="canvas-history-record-title"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(mediaLabel)} · ${escapeHtml(formatCanvasHistoryTime(run?.createdAt))}</small></span>
      <b class="canvas-history-record-status ${escapeAttr(String(run?.status ?? ""))}">${escapeHtml(status)}</b>
    </header>
    ${preview ? `<div class="canvas-history-record-previews" aria-label="输出预览">${preview}</div>` : ""}
    ${prompt ? `<p class="canvas-history-record-prompt">${escapeHtml(prompt.slice(0, expanded ? 1200 : 180))}${!expanded && prompt.length > 180 ? "..." : ""}</p>` : ""}
    ${failure ? `<p class="canvas-history-record-failure">${escapeHtml(failure.slice(0, expanded ? 1200 : 240))}</p>` : ""}
    ${expanded ? `<div class="canvas-history-record-details">
      ${prompt ? `<div><small>提示词</small><pre>${escapeHtml(prompt)}</pre></div>` : ""}
      ${output ? `<div><small>输出</small><pre>${escapeHtml(output)}</pre></div>` : ""}
      <small>模型：${escapeHtml(run?.modelCode ?? "未记录")} · Run ${escapeHtml(run?.runNo ?? "-")}</small>
    </div>` : ""}
    <footer class="canvas-history-record-actions">
      <button type="button" data-action="toggle-canvas-history-record" data-run-id="${escapeAttr(runId)}" aria-label="${expanded ? "收起详情" : "展开详情"}">${expanded ? "收起" : "详情"}</button>
      ${output ? `<button type="button" data-action="copy-canvas-history-text" data-run-id="${escapeAttr(runId)}">复制输出</button>` : ""}
      ${nodeId ? `<button type="button" data-action="select-canvas-node" data-node-id="${escapeAttr(nodeId)}">查看节点</button>` : ""}
      <button type="button" class="danger" data-action="delete-canvas-generation-run" data-run-id="${escapeAttr(runId)}" aria-label="删除生成记录">删除</button>
    </footer>
  </article>`;
}

function formatCanvasTransferBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "准备中";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

function renderLiblibCanvasEdges(document = {}, options = {}) {
  const edgeStyle = options.edgeStyle === "orthogonal" ? "orthogonal" : "curve";
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
      const middleX = Math.round((source.x + target.x) / 2);
      const d = edgeStyle === "orthogonal"
        ? `M ${source.x} ${source.y} H ${middleX} V ${target.y} H ${target.x}`
        : `M ${source.x} ${source.y} C ${source.x + delta} ${source.y}, ${target.x - delta} ${target.y}, ${target.x} ${target.y}`;
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
  if (node?.type === "ai-animation") {
    return renderLiblibAnimationNode(node, options);
  }
  if (node?.type === "ai-director") {
    return renderLiblibDirectorNode(node, options);
  }
  if (node?.type === "group") {
    return renderLiblibGroupNode(node, options);
  }
  if (node?.type === "ai-panorama") {
    return renderLiblibPanoramaNode(node, options);
  }
  if (node?.type === "ai-storyboard") {
    return renderLiblibStoryboardNode(node, options);
  }
  if (["script", "source-text", "ai-text", "ai-markdown", "markdown", "comment"].includes(node?.type)) {
    return renderLiblibTextNode(node, options);
  }
  if (["upload", "source-image", "source-video", "source-audio"].includes(node?.type)) {
    return renderLiblibUploadNode(node, options);
  }
  if (["send", "ai-image"].includes(node?.type)) {
    return renderLiblibGenerationNode(node, options);
  }
  if (["video", "ai-video"].includes(node?.type)) {
    return renderLiblibGenerationNode({
      ...node,
      data: {
        ...(node.data ?? {}),
        mediaKind: "video",
      },
    }, options);
  }
  if (node?.type === "ai-audio" || node?.type === "audio") {
    return renderLiblibGenerationNode({
      ...node,
      data: {
        ...(node.data ?? {}),
        mediaKind: "audio",
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

function renderLiblibDirectorNode(node, { selected = false } = {}) {
  const style = canvasNodePositionStyle(node, { width: 500, height: 340 });
  return `<article class="canvas-lib-node canvas-special-media-node canvas-director-node ${selected ? "selected" : ""}"
    data-action="select-canvas-node" data-canvas-node-id="${escapeAttr(node?.id ?? "")}" data-node-id="${escapeAttr(node?.id ?? "")}" data-node-kind="ai-director" style="${escapeAttr(style)}">
    <header class="canvas-lib-node-title">${renderCanvasIcon("ai-director")}<strong>${escapeHtml(node?.data?.title ?? "AI 导演")}</strong></header>
    <span class="canvas-node-connect left" data-node-id="${escapeAttr(node?.id ?? "")}" data-port-direction="in" data-port-id="${escapeAttr(firstCanvasPortId(node, "inputs"))}" aria-hidden="true">+</span>
    <span class="canvas-node-connect right" data-node-id="${escapeAttr(node?.id ?? "")}" data-port-direction="out" data-port-id="${escapeAttr(firstCanvasPortId(node, "outputs"))}" aria-hidden="true">+</span>
    ${renderCanvasDirectorNodeBody(node)}
  </article>`;
}

function renderLiblibGroupNode(node, { selected = false } = {}) {
  const style = canvasNodePositionStyle(node, { width: 500, height: 340 });
  return `<article class="canvas-lib-node canvas-group-node ${selected ? "selected" : ""}"
    data-action="select-canvas-node" data-canvas-node-id="${escapeAttr(node?.id ?? "")}" data-node-id="${escapeAttr(node?.id ?? "")}" data-node-kind="group" style="${escapeAttr(style)}">
    ${renderCanvasGroupNodeBody(node)}
  </article>`;
}

function renderLiblibAnimationNode(node, { selected = false } = {}) {
  const style = canvasNodePositionStyle(node, { width: 420, height: 378 });
  return `<article class="canvas-lib-node canvas-special-media-node canvas-animation-node ${selected ? "selected" : ""}"
    data-action="select-canvas-node" data-canvas-node-id="${escapeAttr(node?.id ?? "")}" data-node-id="${escapeAttr(node?.id ?? "")}" data-node-kind="ai-animation" style="${escapeAttr(style)}">
    <header class="canvas-lib-node-title">${renderCanvasIcon("ai-animation")}<strong>${escapeHtml(node?.data?.title ?? "AI 动画")}</strong></header>
    <span class="canvas-node-connect left" data-node-id="${escapeAttr(node?.id ?? "")}" data-port-direction="in" data-port-id="${escapeAttr(firstCanvasPortId(node, "inputs"))}" aria-hidden="true">+</span>
    <span class="canvas-node-connect right" data-node-id="${escapeAttr(node?.id ?? "")}" data-port-direction="out" data-port-id="${escapeAttr(firstCanvasPortId(node, "outputs"))}" aria-hidden="true">+</span>
    ${renderCanvasAnimationNodeBody(node)}
  </article>`;
}

function renderLiblibPanoramaNode(node, { selected = false } = {}) {
  const style = canvasNodePositionStyle(node, { width: 420, height: 438 });
  return `<article class="canvas-lib-node canvas-special-media-node canvas-panorama-node ${selected ? "selected" : ""}"
    data-action="select-canvas-node" data-canvas-node-id="${escapeAttr(node?.id ?? "")}" data-node-id="${escapeAttr(node?.id ?? "")}" data-node-kind="ai-panorama" style="${escapeAttr(style)}">
    <header class="canvas-lib-node-title">${renderCanvasIcon("image")}<strong>${escapeHtml(node?.data?.title ?? "AI 全景")}</strong></header>
    <span class="canvas-node-connect left" data-node-id="${escapeAttr(node?.id ?? "")}" data-port-direction="in" data-port-id="${escapeAttr(firstCanvasPortId(node, "inputs"))}" aria-hidden="true">+</span>
    <span class="canvas-node-connect right" data-node-id="${escapeAttr(node?.id ?? "")}" data-port-direction="out" data-port-id="${escapeAttr(firstCanvasPortId(node, "outputs"))}" aria-hidden="true">+</span>
    ${renderCanvasPanoramaNodeBody(node)}
  </article>`;
}

function renderLiblibStoryboardNode(node, { selected = false } = {}) {
  const style = canvasNodePositionStyle(node, { width: 420, height: 356 });
  return `<article class="canvas-lib-node canvas-special-media-node canvas-storyboard-node ${selected ? "selected" : ""}"
    data-action="select-canvas-node" data-canvas-node-id="${escapeAttr(node?.id ?? "")}" data-node-id="${escapeAttr(node?.id ?? "")}" data-node-kind="ai-storyboard" style="${escapeAttr(style)}">
    <header class="canvas-lib-node-title">${renderCanvasIcon("story")}<strong>${escapeHtml(node?.data?.title ?? "AI 分镜")}</strong></header>
    <span class="canvas-node-connect left" data-node-id="${escapeAttr(node?.id ?? "")}" data-port-direction="in" data-port-id="${escapeAttr(firstCanvasPortId(node, "inputs"))}" aria-hidden="true">+</span>
    <span class="canvas-node-connect right" data-node-id="${escapeAttr(node?.id ?? "")}" data-port-direction="out" data-port-id="${escapeAttr(firstCanvasPortId(node, "outputs"))}" aria-hidden="true">+</span>
    ${renderCanvasStoryboardNodeBody(node)}
  </article>`;
}

function renderCanvasNodeToolbar(node) {
  const nodeId = escapeAttr(node?.id ?? "");
  const iconByTool = {
    crop: "image",
    outpaint: "fullscreen",
    "remove-background": "image",
    "camera-studio": "role",
    annotation: "text",
    "batch-grid": "grid",
    composite: "group",
    history: "clock",
    "capture-frame": "image",
    fullscreen: "fullscreen",
    transcription: "text",
    "toggle-play": "audio",
  };
  const tools = resolveCanvasNodeToolbarTools(node);
  if (!tools.length) return "";
  const primary = tools.map((tool) => {
    const attributes = tool.action === "open"
      ? `data-media-action="open" data-media-tool="${escapeAttr(tool.mediaTool)}"`
      : tool.action === "set-canvas-sidebar-mode"
        ? `data-action="set-canvas-sidebar-mode" data-canvas-sidebar-mode="${escapeAttr(tool.mediaTool ?? "assets")}"`
        : tool.action === "set-canvas-audio-generation-mode"
          ? `data-action="set-canvas-audio-generation-mode" data-mode="transcription" data-node-id="${nodeId}"`
          : `data-action="${escapeAttr(tool.action)}" data-node-id="${nodeId}"`;
    return `<button type="button" ${attributes} aria-label="${escapeAttr(tool.label)}" title="${escapeAttr(tool.label)}">${renderCanvasIcon(iconByTool[tool.id] ?? "image")}</button>`;
  }).join("");
  return `<div class="canvas-node-action-toolbar" role="toolbar" aria-label="节点工具栏" style="${escapeAttr(canvasNodeToolbarPositionStyle(node))}">
    ${primary ? `<span class="canvas-node-action-zone" data-toolbar-zone="primary">${primary}</span>` : ""}
    <span class="canvas-node-action-zone" data-toolbar-zone="secondary">
      <button type="button" data-action="duplicate-canvas-node" data-node-id="${nodeId}" aria-label="复制节点" title="复制节点">${renderCanvasIcon("copy")}</button>
      <button type="button" class="danger" data-action="delete-canvas-node" data-node-id="${nodeId}" aria-label="删除节点" title="删除节点">${renderCanvasIcon("trash")}</button>
    </span>
  </div>`;
}

function canvasNodeToolbarPositionStyle(node) {
  const x = Number(node?.position?.x ?? 0);
  const y = Number(node?.position?.y ?? 0);
  return `left:clamp(8px,${x}px,calc(100% - 12rem));top:${Math.max(8, y - 42)}px`;
}

function renderLiblibUploadNode(node, { selected = false, canvasAssets = [] } = {}) {
  const title = node?.data?.title && !String(node.data.title).includes("�")
    ? node.data.title
    : node?.type === "source-video" ? "视频源" : node?.type === "source-audio" ? "音频源" : node?.type === "source-image" ? "图片源" : "上传";
  const mediaKind = node?.data?.mediaKind === "video" ? "video" : node?.data?.mediaKind === "audio" ? "audio" : "image";
  const isSourceNode = ["source-image", "source-video", "source-audio"].includes(node?.type);
  const mediaLabel = mediaKind === "video" ? "视频" : mediaKind === "audio" ? "音频" : "图片";
  const uploadAccept = node?.type === "source-video"
    ? "video/*"
    : node?.type === "source-audio"
      ? "audio/*"
      : node?.type === "source-image"
        ? "image/*"
        : "image/*,video/*,audio/*";
  const uploadLabel = isSourceNode ? `上传${mediaLabel}素材` : "上传图片、视频或音频";
  const mediaUrl = resolveCanvasMediaNodeSource(node, mediaKind, { assets: canvasAssets });
  const fileName = node?.data?.fileName ?? node?.data?.name ?? "";
  const status = node?.data?.status ?? "empty";
  const style = canvasNodePositionStyle(node, { width: 360, height: 220 });
  return `
    <article
      class="canvas-lib-node canvas-upload-node ${["source-audio", "source-video"].includes(node?.type) ? "canvas-special-media-node" : ""} ${selected ? "selected" : ""}"
      data-action="select-canvas-node"
      data-canvas-node-id="${escapeAttr(node?.id ?? "")}"
      data-node-id="${escapeAttr(node?.id ?? "")}"
      data-node-kind="upload"
      data-canvas-node-role="${isSourceNode ? "source" : "upload"}"
      style="${escapeAttr(style)}"
    >
      <header class="canvas-lib-node-title">
        ${renderCanvasIcon("upload")}
        <strong>${escapeHtml(title)}</strong>
        ${isSourceNode ? '<small class="canvas-node-role-label">来源节点</small>' : ""}
      </header>
      <button class="canvas-upload-card ${mediaUrl ? "has-media" : ""}" type="button" data-action="pick-canvas-upload-file" data-node-id="${escapeAttr(node?.id ?? "")}" aria-label="${uploadLabel}" title="${uploadLabel}">
        <span class="canvas-node-connect right" data-node-id="${escapeAttr(node?.id ?? "")}" data-port-direction="out" data-port-id="${escapeAttr(firstCanvasPortId(node, "outputs"))}" aria-hidden="true">+</span>
        ${mediaUrl ? `
          <span class="canvas-upload-preview" ${mediaKind === "video" ? `data-canvas-video-body data-node-id="${escapeAttr(node?.id ?? "")}"` : mediaKind === "audio" ? `data-canvas-audio-body data-node-id="${escapeAttr(node?.id ?? "")}"` : ""}>
            ${mediaKind === "video"
              ? `<video data-canvas-video-player src="${escapeAttr(mediaUrl)}" muted playsinline preload="metadata"></video>`
              : mediaKind === "audio"
                ? `<audio data-canvas-audio-player src="${escapeAttr(mediaUrl)}" controls preload="metadata"></audio>`
                : `<img src="${escapeAttr(mediaUrl)}" alt="" loading="lazy" />`}
          </span>
          <span class="canvas-upload-meta">
            <strong>${escapeHtml(fileName || (mediaKind === "video" ? "视频素材" : mediaKind === "audio" ? "音频素材" : "图片素材"))}</strong>
            <small>${status === "uploading" ? "上传中" : "已选择"}</small>
          </span>
        ` : `
          <span class="canvas-upload-empty-icon" aria-hidden="true">${renderCanvasIcon("upload")}</span>
          <span class="canvas-upload-empty-text">${uploadLabel}</span>
        `}
        <input class="canvas-upload-file-input" type="file" accept="${uploadAccept}" data-canvas-upload-input data-node-id="${escapeAttr(node?.id ?? "")}" tabindex="-1" aria-hidden="true" />
      </button>
    </article>
  `;
}

function renderLiblibGenerationNode(node, { selected = false, canvasDocument = null, canvasAssets = [], generatingNodeId = "" } = {}) {
  const mediaKind = node?.data?.mediaKind === "audio" || node?.type === "audio" || node?.type === "ai-audio"
    ? "audio"
    : node?.data?.mediaKind === "video" || node?.type === "video" ? "video" : "image";
  const title = mediaKind === "video" ? "视频生成" : mediaKind === "audio" ? "音频生成" : "图片生成";
  const promptLabel = mediaKind === "video" ? "输入提示词生成视频" : mediaKind === "audio" ? "输入文本生成语音、音乐或转录" : "输入提示词生成图片";
  const style = canvasNodePositionStyle(node, { width: 420, height: 378 });
  const mediaUrl = resolveCanvasGenerationNodeMediaUrl(node, mediaKind, { assets: canvasAssets });
  const progress = resolveCanvasGenerationNodeProgress(node);
  const progressStage = resolveCanvasGenerationNodeStage(node);
  const progressTaskId = resolveCanvasGenerationNodeTaskId(node);
  const isGenerating = isCanvasNodeGenerating(node, generatingNodeId);
  const failureStatus = String(node?.data?.status ?? "").trim().toLowerCase();
  const isFailed = ["failed", "canceled", "manual_review_required", "result_unknown"].includes(failureStatus);
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
        <small class="canvas-node-role-label">生成节点</small>
      </header>
      <div class="canvas-generation-preview">
        <span class="canvas-node-connect left" data-node-id="${escapeAttr(node?.id ?? "")}" data-port-direction="in" data-port-id="${escapeAttr(firstCanvasPortId(node, "inputs"))}" aria-hidden="true">+</span>
        <span class="canvas-node-connect right" data-node-id="${escapeAttr(node?.id ?? "")}" data-port-direction="out" data-port-id="${escapeAttr(firstCanvasPortId(node, "outputs"))}" aria-hidden="true">+</span>
        ${mediaUrl ? `
          ${renderCanvasGenerationResult(node, mediaKind, mediaUrl, isGenerating)}
        ` : isFailed ? renderCanvasGenerationFailure(node, mediaKind) : isGenerating ? "" : `
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

function isCanvasNodeGenerating(node, generatingNodeId) {
  const status = String(node?.data?.status ?? "").trim().toLowerCase();
  return ["queued", "running", "processing"].includes(status);
}

function renderCanvasGenerationFailure(node, mediaKind) {
  const data = node?.data ?? {};
  const reviewRequired = ["manual_review_required", "result_unknown"].includes(String(data.status ?? "").trim().toLowerCase());
  const message = String(
    data.failureMessage ??
      data.failure?.displayMessage ??
      data.failure?.providerMessage ??
      data.failure?.errorMessage ??
      "生成任务失败，请重新生成。",
  ).trim();
  return `
    <div class="canvas-generation-failure" role="alert">
      ${renderCanvasIcon(mediaKind)}
      <strong>${reviewRequired ? "生成结果待复核" : mediaKind === "video" ? "视频生成失败" : "生图失败"}</strong>
      <small>${escapeHtml(message)}</small>
    </div>
  `;
}

function renderCanvasGenerationResult(node, mediaKind, mediaUrl, isGenerating = false) {
  const resultClass = `canvas-generation-result ${isGenerating ? "is-generating" : ""}`;
  if (mediaKind === "video") {
    const fileName = resolveCanvasGeneratedMediaFileName(node, mediaKind, mediaUrl);
    return `
      <div class="${resultClass}">
        ${renderCanvasMediaNodeBody({ ...node, data: { ...(node.data ?? {}), mediaKind: "video", videoUrl: mediaUrl } })}
        <div class="canvas-generation-result-actions">
          <a class="canvas-generation-result-action" href="${escapeAttr(mediaUrl)}" download="${escapeAttr(fileName)}" target="_blank" rel="noopener" aria-label="下载生成视频" title="下载生成视频">
            ${renderCanvasIcon("download")}
            <span>下载</span>
          </a>
        </div>
      </div>
    `;
  }

  if (mediaKind === "audio") {
    const fileName = resolveCanvasGeneratedMediaFileName(node, mediaKind, mediaUrl);
    return `
      <div class="${resultClass}">
        ${renderCanvasMediaNodeBody({ ...node, data: { ...(node.data ?? {}), mediaKind: "audio", audioUrl: mediaUrl } })}
        <div class="canvas-generation-result-actions">
          <a class="canvas-generation-result-action" href="${escapeAttr(mediaUrl)}" download="${escapeAttr(fileName)}" target="_blank" rel="noopener" aria-label="下载生成音频" title="下载生成音频">
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
    (mediaKind === "video" ? "canvas-video" : mediaKind === "audio" ? "canvas-audio" : "canvas-image"),
  ).trim();
  const safeBaseName = (baseName || (mediaKind === "video" ? "canvas-video" : mediaKind === "audio" ? "canvas-audio" : "canvas-image"))
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .slice(0, 80);
  const extensionMatch = String(mediaUrl ?? "").split(/[?#]/)[0].match(/\.([a-z0-9]{2,5})$/i);
  const extension = extensionMatch?.[1] ?? (mediaKind === "video" ? "mp4" : mediaKind === "audio" ? "mp3" : "png");
  return `${safeBaseName}.${extension}`;
}

function renderCanvasGenerationProgress(progress, stage = "", taskId = "") {
  const percent = Math.max(0, Math.min(100, Math.round(Number(progress) || 0)));
  const stageLabel = canvasGenerationStageLabel(stage, percent);
  const progressLabel = canvasGenerationProgressLabel(percent);
  const shortTaskId = shortCanvasTaskId(taskId);
  return `
    <div class="canvas-generation-progress" aria-label="生成进度 ${percent}%">
      <span class="canvas-generation-progress-kicker">${progressLabel.kicker}</span>
      <span class="canvas-generation-progress-label">${progressLabel.label} ${percent}%</span>
      ${shortTaskId ? `<span class="canvas-generation-progress-task" title="${escapeAttr(taskId)}">任务ID ${escapeHtml(shortTaskId)}</span>` : ""}
      <span class="canvas-generation-progress-stage">${escapeHtml(stageLabel)}</span>
      <span class="canvas-generation-progress-track"><i style="width:${percent}%"></i></span>
    </div>
  `;
}

function canvasGenerationProgressLabel(percent) {
  if (percent >= 75) return { kicker: "结果已返回", label: "云存储处理中" };
  if (percent >= 50) return { kicker: "任务已发送", label: "生成中" };
  return { kicker: "任务排队中", label: "排队中" };
}

function resolveCanvasGenerationNodeProgress(node) {
  const stageProgress = canvasGenerationStageProgress(resolveCanvasGenerationNodeStage(node));
  if (stageProgress !== null) {
    return stageProgress;
  }
  const rawValue = node?.data?.generationProgress ?? node?.data?.progress;
  const value = Number(rawValue);
  if (Number.isFinite(value)) {
    return value;
  }
  const status = String(node?.data?.status ?? "").toLowerCase();
  if (status === "running") return 50;
  if (status === "queued") return 25;
  return 0;
}

function canvasGenerationStageProgress(stage) {
  const normalized = String(stage ?? "").trim().toLowerCase();
  if (["queued", "submitted", "created", "task_created", "queue_unavailable", "queue_stalled", "queued_unprocessed"].includes(normalized)) return 25;
  if (["provider_submitted", "provider_accepted", "accepted", "provider_rendering", "provider_running", "rendering", "running", "processing"].includes(normalized)) return 50;
  if (["provider_succeeded", "provider_completed", "artifact_persisting", "saving_asset", "persisting_asset", "uploading_asset"].includes(normalized)) return 75;
  if (["completed", "succeeded"].includes(normalized)) return 100;
  return null;
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
  if (["queued", "submitted", "created", "task_created"].includes(normalized)) return "任务已入库，等待队列投递到模型";
  if (["provider_submitted", "provider_accepted", "accepted"].includes(normalized)) return "模型已接收，正在排队";
  if (["provider_rendering", "provider_running", "rendering", "running", "processing"].includes(normalized)) return "模型正在生成画面";
  if (["provider_succeeded", "provider_completed", "artifact_persisting"].includes(normalized)) return "模型结果已返回，正在上传云存储";
  if (["saving_asset", "persisting_asset", "uploading_asset"].includes(normalized)) return "正在上传结果到云存储";
  if (["completed", "succeeded"].includes(normalized) || percent >= 100) return "生成完成，正在刷新画布";
  return percent <= 25 ? "任务排队中，等待发送到模型" : "正在同步生成状态";
}

function resolveCanvasGenerationNodeMediaUrl(node, mediaKind, options = {}) {
  if (mediaKind === "audio" || mediaKind === "video") {
    return resolveCanvasMediaNodeSource(node, mediaKind, options);
  }
  const data = node?.data ?? {};
  const candidates = [data.previewUrl, data.resultUrl, data.url, data.imageUrl, data.assetUrl, data.thumbnailUrl];
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
  const mediaCounts = { image: 0, video: 0, audio: 0 };
  return (Array.isArray(document?.edges) ? document.edges : [])
    .filter((edge) => edge.targetNodeId === targetNodeId)
    .flatMap((edge) => resolveCanvasReferencesForNode(nodeMap.get(edge.sourceNodeId), document))
    .filter((item, index, items) => item.url && items.findIndex((candidate) => candidate.url === item.url) === index)
    .filter((item) => item.url)
    .map((item) => {
      const mediaKind = ["image", "video", "audio"].includes(item.kind) ? item.kind : "image";
      mediaCounts[mediaKind] += 1;
      return {
        ...item,
        referenceLabel: mediaKind === "video"
          ? `视频${mediaCounts.video}`
          : mediaKind === "audio" ? `音频${mediaCounts.audio}` : `图${mediaCounts.image}`,
      };
    });
}

function resolveCanvasReferencesForNode(node, document = {}) {
  const direct = resolveCanvasReferenceMedia(node);
  if (direct.url) {
    return [direct];
  }
  return [];
}

function resolveCanvasReferenceMedia(node) {
  if (!node) {
    return { id: "", name: "", url: "", kind: "image" };
  }
  if (node.type === "upload") {
    const kind = node.data?.mediaKind === "video" ? "video" : node.data?.mediaKind === "audio" ? "audio" : "image";
    return {
      id: String(node.id ?? ""),
      name: String(node.data?.fileName ?? node.data?.name ?? (kind === "video" ? "参考视频" : kind === "audio" ? "参考音频" : "参考图")),
      url: String(node.data?.previewUrl ?? node.data?.url ?? node.data?.src ?? ""),
      kind,
    };
  }
  if (node.type === "video" || node.data?.mediaKind === "video") {
    return {
      id: String(node.id ?? ""),
      name: String(node.data?.fileName ?? node.data?.name ?? node.data?.title ?? "参考视频"),
      url: resolveCanvasGenerationNodeMediaUrl(node, "video"),
      kind: "video",
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
      kind: "image",
    };
  }
  return { id: "", name: "", url: "", kind: "image" };
}

function renderCanvasGenerationReferences(references = []) {
  return `
    <div class="canvas-generation-references" aria-label="连接的参考素材">
      ${references.map((item) => `
        <span class="canvas-generation-reference-thumb is-${escapeAttr(item.kind ?? "image")}" title="${escapeAttr(`${item.referenceLabel ?? ""}${item.referenceLabel ? "：" : ""}${item.name}`)}" aria-label="${escapeAttr(`${item.referenceLabel ?? ""}${item.referenceLabel ? "：" : ""}${item.name}`)}">
          ${item.kind === "video"
            ? `<video src="${escapeAttr(item.url)}" muted playsinline preload="metadata"></video>`
            : item.kind === "audio"
              ? `<span class="canvas-generation-reference-media">${renderCanvasIcon("audio")}<small>音频</small></span>`
              : `<img src="${escapeAttr(item.url)}" alt="" loading="lazy" />`}
          ${item.referenceLabel ? `<small class="canvas-generation-reference-label">${escapeHtml(item.referenceLabel)}</small>` : ""}
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
  const isMarkdown = ["markdown", "ai-markdown"].includes(String(node?.type ?? ""));
  const markdownMode = node?.data?.markdownViewMode === "preview" ? "preview" : "edit";
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
    ${isMarkdown ? `<div class="canvas-markdown-toolbar" role="toolbar" aria-label="Markdown 工具栏">
      ${renderCanvasMarkdownNodeTools(node)}
      <span class="canvas-markdown-file-actions">
        <button type="button" data-action="pick-canvas-markdown-file" data-node-id="${escapeAttr(nodeId)}">导入</button>
        <button type="button" data-action="export-canvas-markdown" data-node-id="${escapeAttr(nodeId)}">导出</button>
      </span>
      <input type="file" accept=".md,.markdown,text/markdown,text/plain" data-canvas-markdown-input data-node-id="${escapeAttr(nodeId)}" tabindex="-1" aria-hidden="true" />
    </div>` : ""}
    ${showToolbar && (!isMarkdown || markdownMode === "edit") ? `<div class="canvas-text-format-toolbar" aria-label="文本格式工具条">
      ${toolbarItems.map(([command, label]) => `
        <button type="button" data-action="format-canvas-text-node" data-node-id="${escapeAttr(nodeId)}" data-format-command="${escapeAttr(command)}" aria-label="${escapeAttr(label)}" onmousedown="event.preventDefault()">${renderCanvasToolbarLabel(label)}</button>
      `).join("")}
    </div>` : ""}
    <div class="canvas-inline-editor-title" data-canvas-node-drag-handle data-node-id="${escapeAttr(nodeId)}" aria-hidden="true">${renderCanvasIcon("text")}<span>${escapeHtml(title)}</span></div>
    ${isMarkdown && markdownMode === "preview" ? `<div class="canvas-markdown-preview" aria-label="Markdown 预览">${renderCanvasMarkdownPreview(node?.data?.text ?? stripCanvasHtml(html))}</div>` : `<div
      class="canvas-inline-richtext"
      role="textbox"
      contenteditable="true"
      aria-label="节点内容"
      data-canvas-text-input
      data-node-id="${escapeAttr(nodeId)}"
      data-placeholder="输入内容..."
    >${sanitizeCanvasTextHtml(html)}</div>`}
  `;
}

export function renderCanvasMarkdownPreview(rawText) {
  const lines = String(rawText ?? "").replace(/\r\n?/g, "\n").split("\n");
  const output = [];
  let paragraph = [];
  let listType = "";
  let codeLines = null;
  const flushParagraph = () => {
    if (!paragraph.length) return;
    output.push(`<p>${renderCanvasMarkdownInline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (!listType) return;
    output.push(`</${listType}>`);
    listType = "";
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (codeLines !== null) {
      if (/^```/.test(line.trim())) {
        output.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = null;
      } else codeLines.push(line);
      continue;
    }
    if (/^```/.test(line.trim())) {
      flushParagraph();
      closeList();
      codeLines = [];
      continue;
    }
    let table = null;
    let tableEndIndex = index;
    if (line.includes("|") && lines[index + 1]?.match(/^\s*\|?\s*:?-{3,}/)) {
      const tableLines = [line, lines[index + 1]];
      let cursor = index + 2;
      while (cursor < lines.length && lines[cursor].includes("|")) {
        tableLines.push(lines[cursor]);
        cursor += 1;
      }
      table = parseSingleEpisodeAiResponseMarkdownTable(tableLines.join("\n"));
      tableEndIndex = cursor - 1;
    }
    if (table) {
      flushParagraph();
      closeList();
      output.push(`<div class="canvas-markdown-table-wrap"><table><thead><tr>${table.header.map((cell) => `<th>${renderCanvasMarkdownInline(cell)}</th>`).join("")}</tr></thead><tbody>${table.rows.map((row) => `<tr>${row.map((cell) => `<td>${renderCanvasMarkdownInline(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      index = tableEndIndex;
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }
    const heading = line.match(/^\s*(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      output.push(`<h${level}>${renderCanvasMarkdownInline(heading[2])}</h${level}>`);
      continue;
    }
    if (/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line)) {
      flushParagraph();
      closeList();
      output.push("<hr />");
      continue;
    }
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      closeList();
      output.push(`<blockquote>${renderCanvasMarkdownInline(quote[1])}</blockquote>`);
      continue;
    }
    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const nextType = ordered ? "ol" : "ul";
      if (listType !== nextType) {
        closeList();
        listType = nextType;
        output.push(`<${listType}>`);
      }
      output.push(`<li>${renderCanvasMarkdownInline((unordered ?? ordered)[1])}</li>`);
      continue;
    }
    closeList();
    paragraph.push(line.trim());
  }
  if (codeLines !== null) output.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  flushParagraph();
  closeList();
  return output.join("") || '<p class="canvas-markdown-empty">暂无内容</p>';
}

function renderCanvasMarkdownInline(value) {
  const tokens = [];
  const tokenized = String(value ?? "")
    .replace(/`([^`]+)`/g, (_match, code) => canvasMarkdownToken(tokens, `<code>${escapeHtml(code)}</code>`))
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, (_match, label, url) => canvasMarkdownToken(tokens, `<a href="${escapeAttr(url)}" rel="noopener noreferrer">${escapeHtml(label)}</a>`));
  let rendered = escapeHtml(tokenized)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|[^_])_([^_]+)_/g, "$1<em>$2</em>");
  tokens.forEach((token, index) => { rendered = rendered.replace(`CANVASMDTOKEN${index}END`, token); });
  return rendered;
}

function canvasMarkdownToken(tokens, html) {
  const marker = `CANVASMDTOKEN${tokens.length}END`;
  tokens.push(html);
  return marker;
}

function resolveCanvasTextNodeTitle(node) {
  const source = String(node?.data?.source ?? "");
  return ["markdown", "ai-markdown"].includes(String(node?.type ?? ""))
    ? "Markdown"
    : node?.type === "script" || source === "project_script" || source === "project_script_episode"
    ? "剧本源"
    : "文本源";
}

function renderCanvasToolbarLabel(label) {
  const icons = {
    align: '<path d="M5 6h14M5 12h10M5 18h14" /><path d="M5 4v16" />',
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
  const generationNode = ["send", "image", "video"].includes(String(node?.type ?? ""));
  return {
    x: Math.round(direction === "out" ? x + size.width + 30 : x - 30),
    y: Math.round(y + (generationNode ? 207 : size.height / 2)),
  };
}

function renderLiblibCanvasEditor(node, { modelOptionHtml = "", modelMenuHtml = "", parameterControlHtml = "", canvasDocument = {}, selectedModel = null, promptReferencePreviews = {} } = {}) {
  if (["upload", "script", "director", "ai-director", "markdown", "group", "source-image", "source-video", "source-audio"].includes(node?.type) || (node?.data?.mediaKind === "text" && !isCanvasGenerativeTextNode(node) && node?.type !== "ai-storyboard")) {
    return "";
  }
  return renderLiblibGenerationEditor(node, { modelOptionHtml, modelMenuHtml, parameterControlHtml, canvasDocument, selectedModel, promptReferencePreviews });
}

function resolveSelectedCanvasModel(generationConfig = {}, node = null) {
  if (!node || node.type === "script" || node.type === "director" || (node.data?.mediaKind === "text" && !isCanvasGenerativeTextNode(node) && node.type !== "ai-storyboard")) {
    return null;
  }
  const mediaKind = resolveCanvasNodeMediaKind(node);
  const modelOptions = resolveCanvasNodeModelOptions(generationConfig, node, mediaKind);
  const nodeModelCode = String(node?.data?.modelCode ?? "").trim();
  const selectedModelCode = modelOptions.some((model) => model.modelCode === nodeModelCode)
    ? nodeModelCode
    : String(modelOptions[0]?.modelCode ?? nodeModelCode).trim();
  return modelOptions.find((model) => model.modelCode === selectedModelCode)?.raw ?? null;
}

function renderCanvasModelOptions(generationConfig = {}, node = null) {
  if (!node || node.type === "script" || node.type === "director" || (node.data?.mediaKind === "text" && !isCanvasGenerativeTextNode(node) && node.type !== "ai-storyboard")) {
    return "";
  }
  const mediaKind = resolveCanvasNodeMediaKind(node);
  const modelOptions = resolveCanvasNodeModelOptions(generationConfig, node, mediaKind);
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

function renderCanvasModelMenu(generationConfig = {}, node = null, openMenu = "") {
  if (!node || node.type === "script" || node.type === "director" || (node.data?.mediaKind === "text" && !isCanvasGenerativeTextNode(node) && node.type !== "ai-storyboard")) {
    return "";
  }
  const mediaKind = resolveCanvasNodeMediaKind(node);
  const modelOptions = resolveCanvasNodeModelOptions(generationConfig, node, mediaKind);
  const nodeModelCode = String(node?.data?.modelCode ?? "").trim();
  const selectedModelCode = modelOptions.some((model) => model.modelCode === nodeModelCode)
    ? nodeModelCode
    : String(modelOptions[0]?.modelCode ?? nodeModelCode).trim();
  const selectedModel = modelOptions.find((model) => model.modelCode === selectedModelCode);
  const label = selectedModel?.modelLabel ?? selectedModelCode ?? "后台未配置模型";
  const options = modelOptions.length
    ? modelOptions.map((model) => [model.modelCode, model.modelLabel])
    : [[selectedModelCode, label]];
  return renderGenerationControlMenu({
    field: "model",
    label,
    openMenu,
    options,
    action: "select-canvas-model",
    toggleAction: "toggle-generation-select-menu",
    selectedValue: selectedModelCode,
    scope: "canvas",
    nodeId: node?.id ?? "",
  });
}

function renderCanvasModelParameterControls({ generationConfig = {}, node = null, parameterValues = {}, openMenu = "" } = {}) {
  if (!node || node.type === "script" || node.type === "director" || (node.data?.mediaKind === "text" && !isCanvasGenerativeTextNode(node) && node.type !== "ai-storyboard")) {
    return "";
  }
  const mediaKind = resolveCanvasNodeMediaKind(node);
  const modelOptions = resolveCanvasNodeModelOptions(generationConfig, node, mediaKind);
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

function resolveCanvasNodeMediaKind(node) {
  if (isCanvasGenerativeTextNode(node)) return "text";
  if (node?.type === "ai-animation") return "image";
  if (node?.data?.mediaKind === "audio" || node?.type === "audio" || node?.type === "ai-audio") return "audio";
  if (node?.data?.mediaKind === "video" || node?.type === "video") return "video";
  return "image";
}

function isCanvasGenerativeTextNode(node) {
  return ["ai-text", "ai-markdown"].includes(String(node?.type ?? ""));
}

function resolveCanvasNodeModelOptions(generationConfig, node, mediaKind = resolveCanvasNodeMediaKind(node)) {
  const videoMode = mediaKind === "video" ? resolveCanvasVideoGenerationMode(node) : "";
  const audioMode = mediaKind === "audio" ? resolveCanvasAudioGenerationMode(node) : "";
  return resolveCanvasModelOptions(generationConfig, mediaKind)
    .filter((model) => mediaKind !== "video" || canvasModelMatchesVideoMode(model.raw, videoMode))
    .filter((model) => mediaKind !== "audio" || canvasModelMatchesAudioMode(model.raw, audioMode));
}

function canvasModelMatchesAudioMode(model, mode) {
  const modes = [model?.taskModes, model?.supportedModes, model?.modes, model?.capabilities]
    .filter(Array.isArray)
    .flat()
    .map(normalizeCanvasModeToken)
    .filter(Boolean);
  if (!modes.length) return true;
  const aliases = mode === "music"
    ? ["music", "music_generation", "audio_music_generation"]
    : mode === "transcription"
      ? ["transcription", "speech_to_text", "audio_transcription"]
      : ["text_to_speech", "tts", "audio_text_to_speech"];
  return aliases.some((alias) => modes.includes(alias));
}

function buildCanvasParameterControls({ selectedModel = null, mediaKind = "image", parameterValues = {}, openMenu = "", nodeId = "" } = {}) {
  const schema = selectedModel?.parameterSchema && typeof selectedModel.parameterSchema === "object" && !Array.isArray(selectedModel.parameterSchema)
    ? selectedModel.parameterSchema
    : {};
  if (mediaKind === "audio" || mediaKind === "text") {
    return "";
  }
  if (mediaKind === "video") {
    return renderGenerationSettingsControl({
      kind: "video",
      openMenu,
      settings: buildCanvasVideoSettingsState(selectedModel, parameterValues),
      scope: "canvas",
      nodeId,
    });
  }
  return renderGenerationSettingsControl({
    kind: "image",
    openMenu,
    settings: buildCanvasImageSettingsState(selectedModel, parameterValues),
    scope: "canvas",
    nodeId,
  });
}

function buildCanvasImageSettingsState(selectedModel = null, parameterValues = {}) {
  const schema = selectedModel?.parameterSchema && typeof selectedModel.parameterSchema === "object" && !Array.isArray(selectedModel.parameterSchema)
    ? selectedModel.parameterSchema
    : {};
  const defaults = selectedModel?.defaultParams && typeof selectedModel.defaultParams === "object" ? selectedModel.defaultParams : {};
  const sections = buildConfiguredGenerationSettingsSections({
    schema,
    parameterValues,
    defaultParams: defaults,
    fallbackValues: {
      quality: parameterValues.imageResolution,
      resolution: parameterValues.imageResolution,
      imageResolution: parameterValues.imageResolution,
      aspectRatio: parameterValues.imageAspectRatio,
      imageAspectRatio: parameterValues.imageAspectRatio,
      ratio: parameterValues.imageAspectRatio,
      count: parameterValues.imageCount,
    },
  });
  const ratioField = schema.imageAspectRatio
    ? "imageAspectRatio"
    : schema.aspectRatio
      ? "aspectRatio"
      : schema.ratio
        ? "ratio"
        : "aspectRatio";
  const resolutionField = schema.quality
    ? "quality"
    : schema.resolution
      ? "resolution"
      : schema.imageResolution
        ? "imageResolution"
        : "size";
  const ratioOptions = canvasOptionPairsFromParameter(schema[ratioField]).length
    ? canvasOptionPairsFromParameter(schema[ratioField])
    : canvasOptionPairsFromValues(selectedModel?.supportedRatios, ["1:1", "3:4", "4:3", "16:9", "9:16", "2:3", "3:2", "21:9"]);
  const resolutionOptions = canvasOptionPairsFromParameter(schema[resolutionField]).length
    ? canvasOptionPairsFromParameter(schema[resolutionField])
    : canvasOptionPairsFromValues(
      [...(selectedModel?.supportedQuality ?? []), ...(selectedModel?.supportedResolutions ?? [])],
      ["2K", "4K"],
    );
  return {
    sections: sections.length ? sections : undefined,
    resolutionField,
    ratioField,
    resolutionOptions,
    ratioOptions,
    resolutionTitle: schema[resolutionField]?.label ?? (resolutionField === "size" ? "尺寸" : "分辨率"),
    ratioTitle: schema[ratioField]?.label ?? "图片比例",
    currentResolution: firstCanvasParameterValue(
      parameterValues[resolutionField],
      parameterValues.size,
      parameterValues.quality,
      parameterValues.resolution,
      parameterValues.imageResolution,
      defaults[resolutionField],
      defaults.size,
      defaults.quality,
      defaults.resolution,
      resolutionOptions[0]?.[0],
    ),
    currentRatio: firstCanvasParameterValue(
      parameterValues[ratioField],
      parameterValues.imageAspectRatio,
      parameterValues.aspectRatio,
      parameterValues.ratio,
      defaults[ratioField],
      defaults.imageAspectRatio,
      defaults.aspectRatio,
      defaults.ratio,
      ratioOptions[0]?.[0],
    ),
  };
}

function buildCanvasVideoSettingsState(selectedModel = null, parameterValues = {}) {
  const schema = selectedModel?.parameterSchema && typeof selectedModel.parameterSchema === "object" && !Array.isArray(selectedModel.parameterSchema)
    ? selectedModel.parameterSchema
    : {};
  const defaults = selectedModel?.defaultParams && typeof selectedModel.defaultParams === "object" ? selectedModel.defaultParams : {};
  const sections = buildConfiguredGenerationSettingsSections({
    schema,
    parameterValues,
    defaultParams: defaults,
    fallbackValues: {
      aspectRatio: parameterValues.imageAspectRatio,
      ratio: parameterValues.imageAspectRatio,
      size: parameterValues.videoResolution,
      resolution: parameterValues.videoResolution,
      quality: parameterValues.videoResolution,
      durationSec: parameterValues.videoDurationSec,
    },
  });
  const ratioField = schema.aspectRatio ? "aspectRatio" : schema.ratio ? "ratio" : schema.imageAspectRatio ? "imageAspectRatio" : "aspectRatio";
  const resolutionField = schema.resolution ? "resolution" : schema.quality ? "quality" : "videoResolution";
  const durationField = schema.durationSec ? "durationSec" : "videoDurationSec";
  const ratioOptions = canvasOptionPairsFromParameter(schema[ratioField]).length
    ? canvasOptionPairsFromParameter(schema[ratioField])
    : canvasOptionPairsFromValues(selectedModel?.supportedRatios, ["16:9", "9:16"]);
  const resolutionOptions = canvasOptionPairsFromParameter(schema[resolutionField]).length
    ? canvasOptionPairsFromParameter(schema[resolutionField])
    : canvasOptionPairsFromValues(selectedModel?.supportedQuality, ["1080p"]);
  const durationOptions = (canvasOptionPairsFromParameter(schema[durationField]).length
    ? canvasOptionPairsFromParameter(schema[durationField])
    : canvasOptionPairsFromValues(selectedModel?.supportedDurations, ["5", "10"]))
    .map(([value, label]) => [value, String(label).endsWith("秒") ? label : `${label}秒`]);
  return {
    sections: sections.length ? sections : undefined,
    ratioField,
    resolutionField,
    durationField,
    ratioOptions,
    resolutionOptions,
    durationOptions,
    currentRatio: firstCanvasParameterValue(
      ratioField === "ratio" ? parameterValues.ratio : undefined,
      parameterValues.imageAspectRatio,
      parameterValues.aspectRatio,
      defaults[ratioField],
      defaults.aspectRatio,
      defaults.ratio,
      ratioOptions[0]?.[0],
      "16:9",
    ),
    currentResolution: firstCanvasParameterValue(
      resolutionField === "quality" ? parameterValues.quality : undefined,
      resolutionField === "resolution" ? parameterValues.resolution : undefined,
      parameterValues.videoResolution,
      parameterValues.resolution,
      parameterValues.quality,
      defaults[resolutionField],
      defaults.resolution,
      defaults.quality,
      resolutionOptions[0]?.[0],
      "1080p",
    ),
    currentDuration: firstCanvasParameterValue(
      durationField === "durationSec" ? parameterValues.durationSec : undefined,
      parameterValues.videoDurationSec,
      parameterValues.durationSec,
      defaults.durationSec,
      durationOptions[0]?.[0],
      "5",
    ),
  };
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
  return renderGenerationControlMenu({
    field,
    label,
    openMenu,
    options,
    title,
    scope: "canvas",
    nodeId,
  });
}

function renderLiblibGenerationEditor(node, { modelOptionHtml = "", modelMenuHtml = "", parameterControlHtml = "", canvasDocument = {}, selectedModel = null, promptReferencePreviews = {} } = {}) {
  const mediaKind = isCanvasGenerativeTextNode(node)
    ? "text"
    : node?.type === "ai-animation"
      ? "image"
    : node?.data?.mediaKind === "audio" || node?.type === "audio" || node?.type === "ai-audio"
    ? "audio"
    : node?.data?.mediaKind === "video" || node?.type === "video" ? "video" : "image";
  const videoMode = mediaKind === "video" ? resolveCanvasVideoGenerationMode(node) : "";
  const audioMode = mediaKind === "audio" ? resolveCanvasAudioGenerationMode(node) : "";
  const placeholder = mediaKind === "video"
    ? "请输入您的生视频要求"
    : mediaKind === "audio"
      ? audioMode === "transcription" ? "可选：填写转录提示或术语" : audioMode === "music" ? "输入音乐风格、情绪和歌词" : "输入需要合成的语音文本"
      : mediaKind === "text"
        ? node?.type === "ai-markdown" ? "描述需要生成的 Markdown 文档结构和内容" : "描述需要生成或改写的文本"
      : "请输入您的生图要求";
  const skillCredits = Math.max(0, Math.round(Number(node?.data?.promptSkillPriceCredits) || 0));
  const cost = resolveCanvasGenerationCost(selectedModel, mediaKind, resolveCanvasNodeParameterValues(node)) + skillCredits;
  const connectedTextFragments = resolveConnectedCanvasTextFragments(canvasDocument, node?.id);
  const connectedUploadReferences = mediaKind === "image" || mediaKind === "video" || mediaKind === "audio"
    ? resolveCanvasUploadReferences(canvasDocument, node?.id)
    : [];
  const referenceUploadAccept = mediaKind === "video"
    ? "image/*,video/*,audio/*"
    : mediaKind === "audio"
      ? "audio/*"
      : mediaKind === "image" ? "image/*" : "";
  return `
    <aside class="canvas-node-editor generation-editor ${mediaKind}" data-node-id="${escapeAttr(node?.id ?? "")}" aria-label="${mediaKind === "text" ? "文本生成设置" : mediaKind === "video" ? "视频生成设置" : mediaKind === "audio" ? "音频生成设置" : "图片生成设置"}" style="${escapeAttr(canvasEditorPositionStyle(node, mediaKind === "video" ? { nodeWidth: 420, nodeHeight: 378, editorWidth: 608 } : { nodeWidth: 420, nodeHeight: 378, editorWidth: 600 }))}">
      ${mediaKind === "video" ? renderCanvasVideoModeTabs(videoMode, node?.id ?? "") : ""}
      ${mediaKind === "audio" ? renderCanvasAudioModeTabs(audioMode, node?.id ?? "") : ""}
      <div class="canvas-editor-reference-row">
        ${referenceUploadAccept ? `<button class="canvas-editor-upload" type="button" data-action="pick-canvas-generation-reference-file" data-node-id="${escapeAttr(node?.id ?? "")}" aria-label="添加参考素材" title="添加参考素材">+</button>
        <input type="file" accept="${escapeAttr(referenceUploadAccept)}" data-canvas-generation-reference-input data-node-id="${escapeAttr(node?.id ?? "")}" tabindex="-1" aria-hidden="true" hidden />` : ""}
        <button class="canvas-editor-upload" type="button" data-action="open-canvas-prompt-reference-picker" data-node-id="${escapeAttr(node?.id ?? "")}" aria-label="选择素材引用" title="选择素材引用">@</button>
        ${renderCanvasPromptReferenceThumbnails(node, canvasDocument, promptReferencePreviews)}
        ${renderCanvasConnectedTextReference(connectedTextFragments)}
        ${renderCanvasGenerationReferences(connectedUploadReferences)}
      </div>
      <div class="canvas-prompt-editor-host" data-canvas-prompt-editor data-node-id="${escapeAttr(node?.id ?? "")}">
        <textarea
          id="canvas-prompt-input-${escapeAttr(node?.id ?? "")}"
          aria-label="提示词"
          data-canvas-prompt-input
          data-node-id="${escapeAttr(node?.id ?? "")}"
          placeholder="${escapeAttr(placeholder)}"
        >${escapeHtml(renderCanvasPromptDisplayValue(node?.data?.prompt ?? "", canvasDocument, promptReferencePreviews, node?.id))}</textarea>
      </div>
      ${node?.type === "ai-animation" ? renderCanvasAnimationControls(node) : ""}
      ${mediaKind === "audio" ? renderCanvasAudioOptions(node, audioMode) : ""}
      <footer class="canvas-editor-controls">
        ${modelMenuHtml || `<select aria-label="模型" data-canvas-model-select data-node-id="${escapeAttr(node?.id ?? "")}">${modelOptionHtml}</select>`}
        ${renderCanvasGenerationSkillTrigger(node)}
        ${parameterControlHtml}
        ${renderGenerationSubmitButton({
          action: "run-canvas-node",
          cost,
          className: "canvas-generate-button",
          attrs: `data-node-id="${escapeAttr(node?.id ?? "")}"`,
        })}
      </footer>
    </aside>
  `;
}

export function renderCanvasGenerationSkillTrigger(node = {}) {
  const selectedSkillId = String(node?.data?.promptSkillId ?? "").trim()
    || Object.values(node?.data?.promptSkillIds ?? {}).map(String).find(Boolean)
    || "";
  const selectedSkillTitle = String(node?.data?.promptSkillTitle ?? "").trim();
  return `<button
    class="canvas-editor-skill-trigger ${selectedSkillId ? "active" : ""}"
    type="button"
    data-action="open-canvas-text-skill-modal"
    data-node-id="${escapeAttr(node?.id ?? "")}"
    aria-haspopup="dialog"
    aria-label="${escapeAttr(selectedSkillTitle ? `当前技能：${selectedSkillTitle}` : "选择生成技能")}"
    title="${escapeAttr(selectedSkillTitle || "选择生成技能")}"
  >${renderCanvasIcon("sparkles")}<span>技能</span>${selectedSkillId ? `<small>1</small>` : ""}</button>`;
}

export function renderCanvasPromptDisplayValue(prompt, canvasDocument = {}, previewByToken = {}, targetNodeId = "") {
  let displayValue = String(prompt ?? "");
  const nodeById = new Map((Array.isArray(canvasDocument?.nodes) ? canvasDocument.nodes : [])
    .map((node) => [String(node?.id ?? ""), node]));
  const mediaCounts = { image: 0, video: 0, audio: 0 };
  const connectedDisplays = new Map((Array.isArray(canvasDocument?.edges) ? canvasDocument.edges : [])
    .filter((edge) => String(edge?.targetNodeId ?? "") === String(targetNodeId ?? ""))
    .flatMap((edge) => {
      const sourceNodeId = String(edge?.sourceNodeId ?? "");
      const sourceNode = nodeById.get(sourceNodeId);
      const mediaKind = String(edge?.data?.kind ?? sourceNode?.data?.mediaKind ?? "").toLowerCase();
      if (!sourceNodeId || !["image", "video", "audio"].includes(mediaKind)) return [];
      mediaCounts[mediaKind] += 1;
      const label = mediaKind === "video"
        ? `视频${mediaCounts.video}`
        : mediaKind === "audio" ? `音频${mediaCounts.audio}` : `图${mediaCounts.image}`;
      return [[`@node:${sourceNodeId}`, `【@${label}】`]];
    }));
  const references = [...new Map(
    parseCanvasPromptReferences(displayValue).map((reference) => [reference.token, reference]),
  ).values()].sort((left, right) => right.token.length - left.token.length);
  for (const reference of references) {
    const collection = canvasDocument?.promptReferenceCatalog?.[reference.type];
    const baseRecord = collection && typeof collection === "object" ? collection[reference.id] : null;
    const record = reference.version && baseRecord?.versions && typeof baseRecord.versions === "object"
      ? baseRecord.versions[reference.version]
      : baseRecord;
    const label = String(
      previewByToken?.[reference.token]?.label ?? record?.label ?? baseRecord?.label ?? "",
    ).trim();
    const displayToken = connectedDisplays.get(reference.token)
      ?? String(previewByToken?.[reference.token]?.displayToken ?? "").trim();
    if (displayToken || label) displayValue = displayValue.split(reference.token).join(displayToken || `@${label}`);
  }
  return displayValue;
}

export function renderCanvasPromptReferenceThumbnails(node, canvasDocument = {}, previewByToken = {}) {
  const connectedNodeIds = new Set((Array.isArray(canvasDocument?.edges) ? canvasDocument.edges : [])
    .filter((edge) => String(edge?.targetNodeId ?? "") === String(node?.id ?? ""))
    .map((edge) => String(edge?.sourceNodeId ?? "")));
  const references = parseCanvasPromptReferences(node?.data?.prompt ?? "")
    .filter((reference) => reference.type !== "node" || !connectedNodeIds.has(String(reference.id ?? "")));
  const uniqueReferences = [...new Map(references.map((reference) => [reference.token, reference])).values()];
  return `<div class="canvas-prompt-reference-thumbs" data-canvas-prompt-reference-thumbs aria-label="素材引用">
    ${uniqueReferences.map((reference) => {
      const collection = canvasDocument?.promptReferenceCatalog?.[reference.type];
      const baseRecord = collection && typeof collection === "object" ? collection[reference.id] : null;
      const record = reference.version && baseRecord?.versions && typeof baseRecord.versions === "object"
        ? baseRecord.versions[reference.version]
        : baseRecord;
      const preview = previewByToken?.[reference.token] ?? {};
      const label = String(preview.label ?? record?.label ?? baseRecord?.label ?? reference.id ?? "引用");
      const previewUrls = Array.isArray(preview.previewUrls) ? preview.previewUrls.filter(Boolean) : [];
      const previewUrl = String(preview.previewUrl ?? previewUrls[0] ?? "");
      const count = Math.max(previewUrls.length, Number(preview.count ?? 0));
      return `<span class="canvas-generation-reference-thumb canvas-prompt-reference-thumb" title="${escapeAttr(label)}">
        ${previewUrl
          ? `<img src="${escapeAttr(previewUrl)}" alt="" loading="lazy" />`
          : `<span class="canvas-prompt-reference-fallback" aria-hidden="true">${escapeHtml(label.slice(0, 2) || "@")}</span>`}
        ${count > 1 ? `<small class="canvas-prompt-reference-count">${count}</small>` : ""}
      </span>`;
    }).join("")}
  </div>`;
}

function renderCanvasPromptReferencePicker(ui) {
  const picker = ui.canvasPromptReferencePicker;
  if (!picker?.open) return "";
  const items = Array.isArray(picker.items) ? picker.items : [];
  const groups = [
    ["character", "人物"], ["scene", "场景"], ["prop", "道具"],
    ["node", "节点"], ["asset", "产物"], ["model", "模型"],
  ];
  const sources = [
    ["official", "官方素材库"], ["team", "团队素材库"], ["canvas", "当前画布"],
  ];
  const activeSource = sources.some(([id]) => id === picker.activeSource) ? picker.activeSource : "official";
  const sourceItems = items.filter((item) => item.sourceGroup === activeSource);
  const selected = items.find((item) => String(item.id) === String(picker.selectedId));
  return renderSelectionPickerModal({
    show: true,
    id: "canvas-prompt-reference-picker",
    title: "选择素材引用",
    sourceTabs: sources.map(([id, label]) => ({ id, label })),
    activeSource,
    sourceAction: "set-canvas-prompt-reference-source",
    tabs: groups.map(([id, label]) => ({ id, label, count: sourceItems.filter((item) => item.group === id).length })),
    activeTab: picker.activeTab ?? "character",
    items,
    selectedId: picker.selectedId ?? "",
    emptyLabel: picker.loading ? "正在加载素材..." : picker.error || "当前分类暂无可用素材",
    closeAction: "close-canvas-prompt-reference-picker",
    tabAction: "set-canvas-prompt-reference-tab",
    selectAction: "select-canvas-prompt-reference",
    confirmAction: "confirm-canvas-prompt-reference",
    confirmLabel: "插入引用",
    secondaryConfirmAction: "create-canvas-node-from-prompt-reference",
    secondaryConfirmLabel: "引用并建节点",
    secondaryConfirmDisabled: !["character", "scene", "prop"].includes(selected?.group),
  });
}

function renderCanvasAudioModeTabs(activeMode, nodeId) {
  return `<div class="canvas-editor-tabs audio-mode-tabs" role="tablist" aria-label="音频处理模式">${CANVAS_AUDIO_GENERATION_MODES.map((mode) => `<button class="${mode.id === activeMode ? "active" : ""}" type="button" role="tab" aria-selected="${mode.id === activeMode}" data-action="set-canvas-audio-generation-mode" data-node-id="${escapeAttr(nodeId)}" data-mode="${escapeAttr(mode.id)}">${escapeHtml(mode.label)}</button>`).join("")}</div>`;
}

function resolveCanvasAudioGenerationMode(node) {
  const mode = String(node?.data?.audioGenerationMode ?? node?.data?.audioMode ?? "text-to-speech").trim();
  return CANVAS_AUDIO_GENERATION_MODES.some((item) => item.id === mode) ? mode : "text-to-speech";
}

function renderCanvasAudioOptions(node, mode) {
  const data = node?.data ?? {};
  const nodeId = escapeAttr(node?.id ?? "");
  if (mode === "transcription") {
    return `<div class="canvas-audio-options"><label><span>语言</span><select data-canvas-audio-field="language" data-node-id="${nodeId}"><option value="auto" ${data.language === "auto" || !data.language ? "selected" : ""}>自动识别</option><option value="zh" ${data.language === "zh" ? "selected" : ""}>中文</option><option value="en" ${data.language === "en" ? "selected" : ""}>English</option></select></label><small>连接音频时走转录模型；仅连接文本或直接输入文本时会转换为文本源，不调用音频模型。</small></div>`;
  }
  if (mode === "music") {
    const lyricsMode = String(data.lyricsMode ?? (data.lyrics ? "custom" : "generate"));
    return `<div class="canvas-audio-options canvas-music-options"><label><span>标题</span><input value="${escapeAttr(data.musicTitle ?? "")}" data-canvas-audio-field="musicTitle" data-node-id="${nodeId}" placeholder="可选" /></label><label><span>BPM</span><input type="number" min="1" max="400" value="${escapeAttr(data.musicBpm ?? "")}" data-canvas-audio-field="musicBpm" data-node-id="${nodeId}" /></label><label><span>时长</span><input type="number" min="1" max="240" value="${escapeAttr(data.durationSec ?? 60)}" data-canvas-audio-field="durationSec" data-node-id="${nodeId}" /></label><label class="canvas-audio-toggle"><input type="checkbox" ${data.instrumental === true ? "checked" : ""} data-canvas-audio-field="instrumental" data-node-id="${nodeId}" /><span>纯音乐</span></label><label><span>歌词来源</span><select data-canvas-audio-field="lyricsMode" data-node-id="${nodeId}"><option value="generate" ${lyricsMode === "generate" ? "selected" : ""}>模型生成</option><option value="custom" ${lyricsMode === "custom" ? "selected" : ""}>自定义歌词</option></select></label><label class="canvas-music-lyrics-field"><span>歌词${data.lyricsArtifactId ? " · 已与音乐结果同步" : ""}</span><textarea data-canvas-audio-field="lyrics" data-node-id="${nodeId}" placeholder="可留空由模型生成，也可直接编辑歌词">${escapeHtml(data.lyrics ?? "")}</textarea></label></div>`;
  }
  return `<div class="canvas-audio-options"><label><span>音色 ID</span><input value="${escapeAttr(data.voiceId ?? "")}" placeholder="使用模型默认音色" data-canvas-audio-field="voiceId" data-node-id="${nodeId}" /></label><label><span>语速</span><input type="number" min="0.5" max="2" step="0.1" value="${escapeAttr(data.speed ?? 1)}" data-canvas-audio-field="speed" data-node-id="${nodeId}" /></label></div>`;
}

function resolveCanvasGenerationCost(model, mediaKind = "image", parameterValues = {}) {
  return resolveGenerationCreditCost(mediaKind, {
    parameterValues,
    imageAspectRatio: parameterValues.imageAspectRatio ?? parameterValues.aspectRatio,
    imageResolution: parameterValues.imageResolution ?? parameterValues.quality ?? parameterValues.resolution,
    imageCount: parameterValues.imageCount ?? parameterValues.count,
    imageCreditCost: 90,
    videoResolution: parameterValues.videoResolution ?? parameterValues.resolution,
    videoDurationSec: parameterValues.videoDurationSec ?? parameterValues.durationSec,
    videoCreditCost: 4500,
  }, model);
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
    .filter((node) => node && (
      ["script", "director", "markdown", "source-text", "ai-text", "ai-markdown", "ai-storyboard", "ai-director"].includes(node.type)
      || node.data?.mediaKind === "text"
    ))
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
        <button class="canvas-model-chip" type="button"><span>GVLM 3.1</span><span class="canvas-model-chip__icon" aria-hidden="true">${renderUiChevronIcon("down")}</span></button>
        <span class="canvas-editor-spacer"></span>
        <button type="button" aria-label="翻译">${renderCanvasIcon("translate")}</button>
        <button type="button" aria-label="积分">✦ 1</button>
        <button class="canvas-send-button" type="button" data-action="run-canvas-node" data-node-id="${escapeAttr(node?.id ?? "")}" aria-label="发送">${renderCanvasIcon("arrow-up")}</button>
      </footer>
    </aside>
  `;
}

const CANVAS_CONTEXT_GENERATOR_TYPES = new Set([
  "ai-text",
  "ai-image",
  "ai-video",
  "ai-audio",
  "ai-panorama",
  "ai-animation",
  "ai-storyboard",
  "ai-director",
  "send",
  "video",
  "audio",
]);

const CANVAS_CONTEXT_SHORTCUTS = new Map([
  ["ai-text", "1"],
  ["ai-image", "2"],
  ["ai-video", "3"],
  ["ai-audio", "4"],
  ["ai-panorama", "5"],
  ["ai-animation", "6"],
  ["ai-director", "7"],
  ["source-text", "Alt+1"],
  ["source-image", "Alt+2"],
  ["source-video", "Alt+3"],
  ["source-audio", "Alt+4"],
  ["ai-markdown", "Alt+5"],
]);

function renderCanvasContextMenuTemplateItems(items = [], { showShortcuts = false } = {}) {
  return items.map((item) => {
    const shortcut = showShortcuts ? CANVAS_CONTEXT_SHORTCUTS.get(item.type) : "";
    return `
      <button type="button" role="menuitem" data-action="add-canvas-template" data-template-id="${escapeAttr(item.id)}" data-node-kind="${escapeAttr(item.type)}">
        <span aria-hidden="true">${renderCanvasIcon(item.type)}</span>
        ${escapeHtml(item.title)}
        ${shortcut ? `<kbd aria-label="快捷键 ${escapeAttr(shortcut)}">${escapeHtml(shortcut)}</kbd>` : ""}
      </button>
    `;
  }).join("");
}

function renderCanvasContextMenu(menu = {}, options = {}) {
  const isNodeMenu = menu.mode === "node" && menu.nodeId;
  const isConnectionMenu = menu.mode === "connection" && menu.sourceNodeId;
  const menuWidth = 244;
  const compatibleTemplateIds = new Set(Array.isArray(menu.compatibleTemplateIds) ? menu.compatibleTemplateIds : []);
  const items = resolveCanvasNodeTemplates(options.episodeGenerationConfig)
    .filter((item) => !isNodeMenu && (!isConnectionMenu || compatibleTemplateIds.has(item.id)));
  const blankMenuContentHeight = 32 + (3 * 50) + (2 * 30) + (items.length * 50) + (7 * 10);
  const menuHeight = isNodeMenu
    ? 300 + (menu.characterCaptureEligible ? 44 : 0) + (menu.mediaCopyEligible ? 44 : 0) + (menu.grouped ? 44 : 0)
    : isConnectionMenu ? 360 : Math.min(680, blankMenuContentHeight);
  const stageWidth = Number(menu.stageWidth ?? 0);
  const stageHeight = Number(menu.stageHeight ?? 0);
  const maxLeft = stageWidth > menuWidth ? stageWidth - menuWidth - 8 : Number.POSITIVE_INFINITY;
  const maxTop = stageHeight > menuHeight ? stageHeight - menuHeight - 8 : Number.POSITIVE_INFINITY;
  const left = Math.max(8, Math.min(maxLeft, Number(menu.x ?? 120)));
  const top = Math.max(8, Math.min(maxTop, Number(menu.y ?? 120)));
  return `
    <aside class="canvas-context-menu${isNodeMenu ? " canvas-node-context-menu" : ""}${isConnectionMenu ? " canvas-connection-drop-menu" : ""}" data-canvas-context-menu role="menu" aria-label="${isNodeMenu ? "节点操作菜单" : isConnectionMenu ? "连接并创建节点" : "添加节点菜单"}" style="left:${left}px;top:${top}px">
      ${isConnectionMenu ? `<header><small>引用该节点生成</small><strong>选择兼容节点</strong></header>` : ""}
      ${isNodeMenu ? `
        <button type="button" role="menuitem" data-action="cut-canvas-selection" data-node-id="${escapeAttr(menu.nodeId)}">
          <span aria-hidden="true">${renderCanvasIcon("copy")}</span>
          剪切
        </button>
        <button type="button" role="menuitem" data-action="copy-canvas-selection" data-node-id="${escapeAttr(menu.nodeId)}">
          <span aria-hidden="true">${renderCanvasIcon("copy")}</span>
          复制
        </button>
        <button type="button" role="menuitem" data-action="duplicate-canvas-node" data-node-id="${escapeAttr(menu.nodeId)}">
          <span aria-hidden="true">${renderCanvasIcon("copy")}</span>
          创建副本
        </button>
        ${menu.mediaCopyEligible ? `
          <button type="button" role="menuitem" data-action="copy-canvas-node-media" data-node-id="${escapeAttr(menu.nodeId)}">
            <span aria-hidden="true">${renderCanvasIcon("copy")}</span>
            复制媒体
          </button>
        ` : ""}
        ${menu.characterCaptureEligible ? `
          <button type="button" role="menuitem" data-action="add-canvas-node-to-character-library" data-node-id="${escapeAttr(menu.nodeId)}">
            <span aria-hidden="true">${renderCanvasIcon("image")}</span>
            添加到角色库
          </button>
        ` : ""}
        ${menu.grouped ? `
          <button type="button" role="menuitem" data-action="ungroup-canvas-selection" data-node-id="${escapeAttr(menu.nodeId)}">
            <span aria-hidden="true">${renderCanvasIcon("group")}</span>
            取消分组
          </button>
        ` : ""}
        <button type="button" role="menuitem" class="danger" data-action="delete-canvas-node" data-node-id="${escapeAttr(menu.nodeId)}">
          <span aria-hidden="true">${renderCanvasIcon("trash")}</span>
          删除
        </button>
      ` : ""}
      ${!isNodeMenu && !isConnectionMenu ? `
        <button type="button" role="menuitem" data-action="paste-canvas-selection"><span aria-hidden="true">${renderCanvasIcon("clipboard")}</span>粘贴</button>
        <button type="button" role="menuitem" data-action="undo-canvas-change"><span aria-hidden="true">${renderCanvasIcon("undo")}</span>撤销</button>
        <button type="button" role="menuitem" data-action="redo-canvas-change"><span aria-hidden="true">${renderCanvasIcon("redo")}</span>重做</button>
        <section class="canvas-context-menu-group" data-canvas-node-group="generator" role="group" aria-label="生成节点">
          <strong>生成节点</strong>
          ${renderCanvasContextMenuTemplateItems(items.filter((item) => CANVAS_CONTEXT_GENERATOR_TYPES.has(item.type)), { showShortcuts: true })}
        </section>
        <section class="canvas-context-menu-group" data-canvas-node-group="source" role="group" aria-label="来源节点">
          <strong>来源节点</strong>
          ${renderCanvasContextMenuTemplateItems(items.filter((item) => !CANVAS_CONTEXT_GENERATOR_TYPES.has(item.type)), { showShortcuts: true })}
        </section>
      ` : ""}
      ${isNodeMenu || isConnectionMenu ? renderCanvasContextMenuTemplateItems(items) : ""}
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
    const sections = Array.isArray(sectionCache[id])
      ? resolveCanvasScriptEpisodes(sectionCache[id], script)
      : [];
    records.push({
      id,
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
  const nodeWidth = Number(node?.size?.width ?? options.nodeWidth ?? 360);
  const nodeHeight = Number(options.nodeHeight ?? node?.size?.height ?? 260);
  const editorWidth = Number(options.editorWidth ?? 600);
  const editorHeight = Number(options.editorHeight ?? 220);
  const left = Math.max(12, Math.round(nodeX + (nodeWidth / 2) - (editorWidth / 2)));
  const top = Math.round(nodeY >= 260
    ? Math.max(12, nodeY - editorHeight - 12)
    : nodeY + nodeHeight + 2);
  return `left:${left}px;top:${top}px;--editor-width:${editorWidth}px`;
}

function canvasViewportStyle(viewport = {}) {
  const x = Number(viewport.x ?? 0);
  const y = Number(viewport.y ?? 0);
  const zoom = Number(viewport.zoom ?? 1);
  const toolbarScale = 1 / Math.max(0.1, Number.isFinite(zoom) ? zoom : 1);
  return `--canvas-pan-x:${x}px;--canvas-pan-y:${y}px;--canvas-zoom:${zoom};--canvas-toolbar-scale:${toolbarScale}`;
}

function canvasGridStyle(viewport = {}) {
  const x = Number(viewport.x ?? 0);
  const y = Number(viewport.y ?? 0);
  const zoom = Number(viewport.zoom ?? 1);
  const gridSize = Math.max(6, Math.round(20 * zoom * 100) / 100);
  const majorGridSize = Math.round(gridSize * 5 * 100) / 100;
  return `--canvas-grid-size:${gridSize}px;--canvas-grid-major-size:${majorGridSize}px;--canvas-grid-x:${x}px;--canvas-grid-y:${y}px`;
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
  const aliases = {
    "ai-text": "text",
    "ai-image": "image",
    "ai-video": "video",
    "ai-audio": "audio",
    "ai-animation": "video",
    "ai-panorama": "image",
    "ai-markdown": "markdown",
    "ai-storyboard": "story",
    "ai-director": "role",
    "source-text": "text",
    "source-image": "image",
    "source-video": "video",
    "source-audio": "audio",
  };
  const icons = {
    audio: '<path d="M9 18V6l10-2v12" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="16" r="2" />',
    align: '<path d="M5 5v14" /><path d="M9 8h10M9 12h7M9 16h10" />',
    book: '<path d="M5 5.5h6.2a2.8 2.8 0 0 1 2.8 2.8v10.2H7.8A2.8 2.8 0 0 1 5 15.7V5.5Z" /><path d="M14 8.3h5v10.2h-5" />',
    clock: '<circle cx="12" cy="12" r="8" /><path d="M12 7.8v4.6l3 1.8" />',
    collapse: '<path d="M14 6 8 12l6 6" /><path d="M20 6 14 12l6 6" />',
    clipboard: '<path d="M9 5.5h6" /><rect x="6" y="5" width="12" height="15" rx="2" /><path d="M9 4h6v3H9z" />',
    comment: '<path d="M5 5h14v11H9l-4 3V5Z" /><path d="M8 9h8M8 12h5" />',
    connections: '<circle cx="6" cy="7" r="2" /><circle cx="18" cy="7" r="2" /><circle cx="12" cy="17" r="2" /><path d="m7.8 8 3 7M16.2 8l-3 7M8 7h8" />',
    copy: '<rect x="8" y="8" width="10" height="10" rx="1.6" /><path d="M6 15.5H5.8A1.8 1.8 0 0 1 4 13.7V5.8A1.8 1.8 0 0 1 5.8 4h7.9A1.8 1.8 0 0 1 15.5 5.8V6" />',
    cursor: '<path d="M7 4.5 18.5 12 13 13.2l-2.4 5.1L7 4.5Z" />',
    download: '<path d="M12 4.5v10" /><path d="m7.5 10 4.5 4.5 4.5-4.5" /><path d="M5 19.5h14" />',
    distribute: '<path d="M5 5v14M12 8v8M19 5v14" /><path d="M3 12h4M10 12h4M17 12h4" />',
    edge: '<path d="M4 18h5V6h6v12h5" /><path d="m17 15 3 3-3 3" />',
    fullscreen: '<path d="M8.5 4H4v4.5" /><path d="M4 4l5.2 5.2" /><path d="M15.5 4H20v4.5" /><path d="m20 4-5.2 5.2" /><path d="M8.5 20H4v-4.5" /><path d="m4 20 5.2-5.2" /><path d="M15.5 20H20v-4.5" /><path d="m20 20-5.2-5.2" />',
    grid: '<path d="M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z" />',
    group: '<rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /><path d="M14 7h4v4M10 17H6v-4" />',
    help: '<circle cx="12" cy="12" r="8" /><path d="M9.8 9.4a2.4 2.4 0 1 1 3.8 2c-.9.6-1.5 1.1-1.5 2.1" /><path d="M12 16.7h.01" />',
    image: '<rect x="4.5" y="5" width="15" height="14" rx="2" /><path d="m7.5 16 3.4-4 2.5 2.8 1.7-2 2.9 3.2" /><circle cx="15.5" cy="9" r="1.2" />',
    keyboard: '<rect x="4" y="7" width="16" height="10" rx="1.8" /><path d="M7 10h.01M10 10h.01M13 10h.01M16 10h.01M8 14h8" />',
    link: '<path d="M9.5 14.5 14.5 9.5" /><path d="M10.3 8.2 11.8 6.7a3 3 0 0 1 4.2 4.2l-1.5 1.5" /><path d="M13.7 15.8 12.2 17.3A3 3 0 0 1 8 13.1l1.5-1.5" />',
    magnet: '<path d="M6 5v7a6 6 0 0 0 12 0V5" /><path d="M6 9h4M14 9h4M6 5h4v4H6zM14 5h4v4h-4z" />',
    map: '<path d="m4 6 5-2 6 2 5-2v14l-5 2-6-2-5 2V6Z" /><path d="M9 4v14M15 6v14" />',
    markdown: '<path d="M4 6h16v12H4z" /><path d="M7 15V9l3 3 3-3v6M16 9v6m-2-2 2 2 2-2" />',
    minus: '<path d="M5 12h14" />',
    panel: '<rect x="4" y="5" width="16" height="14" rx="2" /><path d="M9 5v14" />',
    plus: '<path d="M12 5v14M5 12h14" />',
    role: '<rect x="5" y="5" width="14" height="14" rx="2" /><circle cx="12" cy="10" r="2.2" /><path d="M8.4 16a4 4 0 0 1 7.2 0" />',
    redo: '<path d="M17 7h3v-3" /><path d="M20 7a8 8 0 1 0 1 7" />',
    search: '<circle cx="10.8" cy="10.8" r="5.8" /><path d="m15.2 15.2 4 4" />',
    sparkles: '<path d="m12 3 1.3 3.7L17 8l-3.7 1.3L12 13l-1.3-3.7L7 8l3.7-1.3L12 3Z" /><path d="m18 13 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13Z" /><path d="m6 14 .7 1.8 1.8.7-1.8.7L6 19l-.7-1.8-1.8-.7 1.8-.7L6 14Z" />',
    share: '<circle cx="6.5" cy="12" r="2" /><circle cx="17.5" cy="7" r="2" /><circle cx="17.5" cy="17" r="2" /><path d="m8.3 11.2 7.4-3.4M8.3 12.8l7.4 3.4" />',
    sort: '<path d="M8 7h9M8 12h6M8 17h3" /><path d="m5 8-2 2 2 2" />',
    send: '<path d="M12 19V5" /><path d="m5 12 7-7 7 7" />',
    story: '<path d="M6 5h12v14H6z" /><path d="M9 8h6M9 11h6M9 14h3" /><path d="M18 8l2-1v10l-2-1" />',
    text: '<rect x="5" y="4.5" width="14" height="15" rx="2" /><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4.5" />',
    trash: '<path d="M5.5 7h13" /><path d="M9 7V5.5h6V7" /><path d="m8 10 .5 8.2h7l.5-8.2" /><path d="M11 11.5v4.8M14 11.5v4.8" />',
    undo: '<path d="M7 7H4v-3" /><path d="M4 7a8 8 0 1 1-1 7" />',
    translate: '<path d="M5 5h8" /><path d="M9 5v14" /><path d="M4 19h10" /><path d="M7 9c.7 2.1 2.2 3.9 5 5" /><path d="M12 9c-.7 2.1-2.2 3.9-5 5" /><path d="M17 10l3.5 9" /><path d="M14.5 19l3.5-9" /><path d="M15.5 16h4" />',
    upload: '<path d="M12 16V5" /><path d="m7 10 5-5 5 5" /><path d="M5 19h14" />',
    video: '<rect x="4" y="6" width="13" height="12" rx="2" /><path d="m17 10 4-2v8l-4-2" /><path d="M8 10.5 11.5 12 8 13.5z" />',
    "arrow-up": '<path d="M12 19V5" /><path d="m5 12 7-7 7 7" />',
    user: '<circle cx="12" cy="8.5" r="3" /><path d="M6.5 19a5.5 5.5 0 0 1 11 0" />',
  };

  return `
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      ${icons[aliases[icon] ?? icon] ?? icons.plus}
    </svg>
  `;
}

function renderUiChevronIcon(direction = "down") {
  const normalizedDirection = direction === "up" ? "up" : "down";

  return `
    <svg class="ui-chevron-icon ${normalizedDirection === "up" ? "is-up" : ""}" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      <path d="m7 10 5 5 5-5" />
    </svg>
  `;
}

function normalizeCustomerSupportDisplayConfig(config = {}) {
  const source = config && typeof config === "object" ? config : {};
  return {
    onlineServiceLabel: String(source.onlineServiceLabel ?? "").trim(),
    communityTitle: String(source.communityTitle ?? "").trim(),
    communitySubtitle: String(source.communitySubtitle ?? "").trim(),
    communityImageUrl: String(source.communityImageUrl ?? "").trim(),
    enterpriseContactImageUrl: String(source.enterpriseContactImageUrl ?? "").trim(),
  };
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
    wallet: `
      <path d="M4.5 7.5A2.25 2.25 0 0 1 6.75 5.25h10.5A2.25 2.25 0 0 1 19.5 7.5v9a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 16.5v-9Z" />
      <path d="M4.5 8.25h12.75A2.25 2.25 0 0 1 19.5 10.5v.75h-4.125a1.875 1.875 0 1 0 0 3.75H19.5v1.5" />
      <path d="M15.75 13.125h.75" />
    `,
    bell: `
      <path d="M14.857 17.082a23.848 23.848 0 0 0 4.182 1.022.75.75 0 0 1 .21 1.415 24.878 24.878 0 0 1-14.498 0 .75.75 0 0 1 .21-1.415 23.848 23.848 0 0 0 4.182-1.022M15 8.25a3 3 0 1 0-6 0c0 1.102-.412 2.105-1.091 2.867-.549.617-.879 1.398-.879 2.258v.375h9.94v-.375c0-.86-.33-1.64-.88-2.258A4.233 4.233 0 0 1 15 8.25Z" />
    `,
    palette: `
      <path d="M12 4.5a7.5 7.5 0 0 0 0 15h1.5a1.5 1.5 0 0 0 .6-2.874.95.95 0 0 1 .38-1.826H16a3.5 3.5 0 0 0 0-7h-.35A7.46 7.46 0 0 0 12 4.5Z" />
      <path d="M7.9 11.2h.01M10.2 8.4h.01M13.4 8.1h.01M15.9 11h.01" />
    `,
    tasks: `
      <rect x="5.25" y="4.5" width="13.5" height="15" rx="1.5" />
      <path d="M8.25 8.25h7.5M8.25 12h7.5M8.25 15.75h4.5" />
    `,
    support: `
      <path d="M4.5 12a7.5 7.5 0 1 1 15 0v1.5M6.75 15.75H6A2.25 2.25 0 0 1 3.75 13.5v-.75A2.25 2.25 0 0 1 6 10.5h.75v5.25Zm10.5 0H18a2.25 2.25 0 0 0 2.25-2.25v-.75A2.25 2.25 0 0 0 18 10.5h-.75v5.25ZM9.75 18.75h3.75" />
    `,
    bot: `
      <path d="M12 5.25v-2M7.5 8.25h9A2.25 2.25 0 0 1 18.75 10.5v5.25A2.25 2.25 0 0 1 16.5 18h-9a2.25 2.25 0 0 1-2.25-2.25V10.5A2.25 2.25 0 0 1 7.5 8.25Z" />
      <path d="M9 13.125h.01M15 13.125h.01M9.75 16.5h4.5" />
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

function renderThemeSwitcher(selectedThemeId, themeMenuOpen = false) {
  const selectedTheme = WORKBENCH_THEME_OPTIONS.find((theme) => theme.id === selectedThemeId)
    ?? WORKBENCH_THEME_OPTIONS.find((theme) => theme.id === DEFAULT_WORKBENCH_THEME_ID)
    ?? WORKBENCH_THEME_OPTIONS[0];
  return `
    <div class="statusbar-popover-wrap theme-popover-wrap ${themeMenuOpen ? "is-open" : ""}">
      <button class="statusbar-quick-action icon-action theme-action" type="button" aria-haspopup="menu" aria-expanded="${themeMenuOpen ? "true" : "false"}" aria-label="主题样式" data-action="toggle-workbench-theme-menu">
        <span class="statusbar-action-icon">${renderStatusbarActionIcon("palette")}</span>
      </button>
      <div class="statusbar-popover theme-popover" role="menu" aria-label="主题样式">
        <div class="theme-popover-head">
          <strong>主题样式</strong>
          <span>${escapeHtml(selectedTheme.label)}</span>
        </div>
        <div class="theme-option-list">
          ${WORKBENCH_THEME_OPTIONS.map((theme) => `
            <button class="theme-option ${theme.id === selectedTheme.id ? "active" : ""}" type="button" role="menuitemradio" aria-checked="${theme.id === selectedTheme.id ? "true" : "false"}" data-action="select-workbench-theme" data-theme-id="${escapeAttr(theme.id)}">
              <span class="theme-option-swatches" aria-hidden="true">
                ${theme.swatches.map((color) => `<i style="--theme-swatch:${escapeAttr(color)}"></i>`).join("")}
              </span>
              <span class="theme-option-copy">
                <strong>${escapeHtml(theme.label)}</strong>
                <small>${escapeHtml(theme.description)}</small>
              </span>
            </button>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

export function renderGlobalStatusbar(session, options = {}) {
  const {
    hideBrand = false,
    showEpisodeReturn = false,
    showEpisodeStoryboardJump = false,
    showEpisodeAssetJump = false,
    creditBalance = 0,
    membershipStatus = null,
    selectedThemeId = DEFAULT_WORKBENCH_THEME_ID,
    themeMenuOpen = false,
    customerSupportConfig = null,
    announcementUnread = false,
    taskCenterActiveCount = 0,
  } = options;
  const accountCard = resolveStatusbarAccountCard(session, membershipStatus);
  const isTeamMember = isTeamMemberSession(session);
  const isAnonymous = !hasActiveSessionUser(session);
  const walletLabel = isTeamMember ? "子账户积分" : "积分";
  const supportConfig = normalizeCustomerSupportDisplayConfig(customerSupportConfig);
  const supportQrUrl = supportConfig.communityImageUrl ? resolveApiUrl(supportConfig.communityImageUrl) : "";
  const hasSupportCard = Boolean(supportConfig.communityTitle || supportConfig.communitySubtitle || supportQrUrl);
  const hasSupportPopover = Boolean(supportConfig.onlineServiceLabel || hasSupportCard);
  return `
    <header class="global-statusbar ${hideBrand ? "global-statusbar-hide-brand" : ""}" aria-label="全局状态栏">
      <div class="statusbar-brand ${showEpisodeReturn ? "statusbar-episode-return" : ""}" aria-label="${showEpisodeReturn ? "剧集导航" : "品牌标识"}">
        ${showEpisodeReturn
          ? `<button class="statusbar-quick-action episode-replica-return episode-statusbar-return" type="button" data-action="back-to-episode-hub">
              <span aria-hidden="true">←</span><strong>返回剧集</strong>
            </button>`
          : `<div class="statusbar-wondershare">
              <span class="statusbar-n-mark" aria-hidden="true">灵</span>
              <div>
                <strong>灵曦剧场</strong>
              </div>
            </div>`}
      </div>
      ${showEpisodeStoryboardJump || showEpisodeAssetJump
        ? `<div class="statusbar-episode-center">
            <button class="statusbar-quick-action episode-replica-pill episode-replica-scope-jump ${showEpisodeStoryboardJump ? "episode-replica-asset-scope-jump" : "episode-replica-storyboard-scope-jump"}" type="button" data-action="set-muse-scope-mode" data-mode="${showEpisodeStoryboardJump ? "storyboard" : "assets"}">${showEpisodeStoryboardJump ? "前往分镜" : "前往生图"}</button>
          </div>`
        : ""}
      <div class="statusbar-actions">
        ${renderThemeSwitcher(selectedThemeId, themeMenuOpen)}
        <a class="statusbar-quick-action text-action" href="${escapeAttr(CREATOR_GUIDE_URL)}" target="_blank" rel="noopener noreferrer" aria-label="创作手册">
          <span class="statusbar-action-icon">${renderStatusbarActionIcon("handbook")}</span>
          <span>创作手册</span>
        </a>
        <button class="statusbar-quick-action text-action task-center-action" type="button" aria-label="任务中心${taskCenterActiveCount > 0 ? `，${taskCenterActiveCount} 个任务进行中` : ""}" data-action="open-task-center">
          <span class="statusbar-action-icon">${renderStatusbarActionIcon("tasks")}</span>
          <span>任务中心</span>
          ${taskCenterActiveCount > 0 ? `<b class="task-center-action-count">${escapeHtml(String(Math.min(99, taskCenterActiveCount)))}${taskCenterActiveCount > 99 ? "+" : ""}</b>` : ""}
        </button>
        ${isTeamMember || isAnonymous ? "" : `
        <button class="statusbar-quick-action credit-action" type="button" aria-label="购买套餐" data-action="open-pricing">
          <span class="statusbar-action-icon cart-icon">${renderStatusbarActionIcon("cart")}</span>
          <span>购物车</span>
        </button>
        `}
        ${isAnonymous ? "" : `<button class="statusbar-quick-action wallet-action" type="button" aria-label="积分明细" data-action="open-credit-ledger">
          <span class="statusbar-action-icon credit-icon">${renderStatusbarActionIcon("sparkle")}</span>
          <span>${escapeHtml(walletLabel)}</span>
          <b>${escapeHtml(String(creditBalance))}</b>
        </button>`}
        <button class="statusbar-quick-action icon-action announcement-action ${announcementUnread ? "has-unread" : ""}" type="button" aria-label="${announcementUnread ? "通知公告，有未读" : "通知公告"}" data-action="open-announcements">
          <span class="statusbar-action-icon">${renderStatusbarActionIcon("bell")}</span>
          ${announcementUnread ? `<span class="announcement-unread-dot" aria-hidden="true"></span>` : ""}
        </button>
        <div class="statusbar-popover-wrap support-popover-wrap ${isAnonymous ? "anonymous-support-popover-wrap" : "account-support-popover-wrap"}">
          <button class="statusbar-quick-action icon-action" type="button" aria-haspopup="menu" aria-label="客服支持">
            <span class="statusbar-action-icon">${renderStatusbarActionIcon("support")}</span>
          </button>
          ${hasSupportPopover ? `
          <div class="statusbar-popover support-popover" role="menu" aria-label="客服支持">
            <div class="support-menu-list">
              ${supportConfig.onlineServiceLabel ? `<button class="popover-menu-item featured support-menu-item" type="button" role="menuitem">
                <span class="support-menu-icon">${renderStatusbarActionIcon("bot")}</span>
                <strong>${escapeHtml(supportConfig.onlineServiceLabel)}</strong>
              </button>` : ""}
              ${hasSupportCard ? `
              <div class="support-community-card" role="presentation">
                ${supportConfig.communityTitle ? `<strong>${escapeHtml(supportConfig.communityTitle)}</strong>` : ""}
                ${supportConfig.communitySubtitle ? `<span>${escapeHtml(supportConfig.communitySubtitle)}</span>` : ""}
                ${supportQrUrl ? `<div class="support-community-qr">
                  <img src="${escapeAttr(supportQrUrl)}" alt="${escapeAttr(supportConfig.communityTitle || "客服二维码")}" loading="lazy" />
                </div>` : ""}
              </div>
              ` : ""}
            </div>
          </div>
          ` : ""}
        </div>
        ${isAnonymous ? `
        <button class="statusbar-quick-action text-action login-action" type="button" data-action="logout">
          <span>立即登录</span>
        </button>
        ` : `<div class="statusbar-popover-wrap account-popover-wrap">
          <button class="statusbar-avatar hero-avatar" type="button" aria-haspopup="menu" aria-label="账号">
            <svg class="statusbar-avatar-icon user-avatar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="8" r="5"></circle>
              <path d="M20 21a8 8 0 0 0-16 0"></path>
            </svg>
          </button>
          <div class="statusbar-popover account-popover" role="menu">
            <div class="account-popover-card">
              <strong>${escapeHtml(accountCard.primaryText)}</strong>
              <span>${escapeHtml(accountCard.secondaryText)}</span>
            </div>
            <button class="popover-menu-item" type="button" role="menuitem" data-action="open-account-settings">账号设置</button>
            ${isTeamMember ? "" : `<button class="popover-menu-item" type="button" role="menuitem" data-action="open-invite-gift">邀请有礼</button>`}
            <button class="popover-menu-item" type="button" role="menuitem" data-action="open-community-page">社区反馈</button>
            <button class="popover-menu-item danger" type="button" role="menuitem" data-action="logout">退出登录</button>
          </div>
        </div>`}
      </div>
    </header>
  `;
}

function renderHomeHero({ detailState, session, ui = {} }) {
  const isTeamMember = isTeamMemberSession(session);
  const homeSeo = SEO_LANDING_PAGES.home;
  return `
    <section class="home-hero" aria-label="首页">
      ${renderInlineStatusToast(ui, "home-hero-toast")}
      <div class="home-liquid-ether" data-liquid-ether-root aria-hidden="true"></div>
      <div class="home-cinematic-sky" aria-hidden="true">
        <span class="home-starfield-layer layer-one"></span>
        <span class="home-starfield-layer layer-two"></span>
        <span class="home-scanline-layer"></span>
      </div>
      <div class="home-lightfall-field" data-lightfall-root aria-hidden="true"></div>
      <div class="home-cursor-aura" aria-hidden="true"></div>
      <div class="hero-overlay"></div>
      <div class="hero-content">
        <h1 class="hero-title">AI视频生成工具，专为短剧和漫剧创作</h1>
        <p class="hero-subtitle">从小说/剧本解析，到剧本转分镜、角色场景资产、图生视频和短剧成片，帮助创作者制作AI短剧、AI漫剧和视频短剧。</p>
        <div class="hero-value-row" aria-label="核心卖点">
          <span>影视级规模化生产</span>
          <span>小成本成就大爆款</span>
        </div>
        <div class="hero-actions">
          ${isTeamMember ? "" : `<button class="hero-cta" type="button" data-action="open-create-modal">创建项目</button>`}
        </div>
        ${renderHomeSeoKeywordButtons(homeSeo)}
      </div>
      ${renderHomeSeoSidePanel(homeSeo)}
    </section>
  `;
}

function renderDirectorDeskSurface(ui = {}) {
  return `
    <section class="director-desk-workbench-surface" aria-label="3D 导演台">
      ${renderInlineStatusToast(ui)}
      <div class="director-desk-stage" data-director-desk-mount>
        <div class="director-desk-loading" role="status">正在加载导演台...</div>
      </div>
      <a class="director-desk-credit" href="https://deerflow.tech" target="_blank" rel="noreferrer">Created By Deerflow</a>
    </section>
  `;
}

function renderHomeSeoKeywordButtons(page) {
  const panelTargets = ["features", "workflow", "features", "faq"];
  return `
    <div class="hero-status-strip" aria-label="创作入口">
      ${page.keywords.map((keyword, index) => `
        <button type="button" data-action="open-home-seo-panel" data-seo-panel="${escapeAttr(panelTargets[index] ?? "features")}">
          ${escapeHtml(keyword)}
        </button>
      `).join("")}
    </div>
  `;
}

function renderHomeSeoSidePanel(page) {
  return `
    <aside class="home-seo-side-panel" aria-label="首页创作能力">
      <div class="seo-disclosure-grid home-seo-panel-grid">
        <details class="seo-disclosure-panel home-seo-panel-item" data-seo-panel="features">
          <summary>核心能力</summary>
          <div class="seo-feature-grid">
            ${page.features.map(([title, body]) => `
              <article class="seo-feature-card">
                <strong>${escapeHtml(title)}</strong>
                <span>${escapeHtml(body)}</span>
              </article>
            `).join("")}
          </div>
        </details>
        <details class="seo-disclosure-panel home-seo-panel-item" data-seo-panel="workflow">
          <summary>创作流程</summary>
          <section class="seo-workflow-band" aria-label="使用流程">
            <ol>
              ${page.workflow.map((step, index) => `
                <li>
                  <i>${String(index + 1).padStart(2, "0")}</i>
                  <span>${escapeHtml(step)}</span>
                </li>
              `).join("")}
            </ol>
          </section>
        </details>
        <details class="seo-disclosure-panel home-seo-panel-item" data-seo-panel="faq">
          <summary>常见问题</summary>
          <section class="seo-faq-list" aria-label="常见问题">
            ${page.faqs.map(([question, answer]) => `
              <article>
                <h4>${escapeHtml(question)}</h4>
                <p>${escapeHtml(answer)}</p>
              </article>
            `).join("")}
          </section>
        </details>
      </div>
    </aside>
  `;
}

function renderScrollableWorkbenchSurface(surface, content) {
  const legacyClass = surface === "library" ? " library-panel-scroll" : "";
  return `
    <div class="workbench-scroll-surface${legacyClass}" data-scroll-surface="${escapeAttr(surface)}">
      ${content}
    </div>
  `;
}

function renderProjectGallery({ ui, session }) {
  const isTeamMember = isTeamMemberSession(session);
  const snapshot = getProjectGallerySnapshot(ui);
  const selectedIds = normalizeSelectedProjectIds(ui.selectedProjectIds);
  const selectedCount = snapshot.pageProjects.filter((project) => selectedIds.has(String(project.id ?? ""))).length;
  const searchQuery = snapshot.searchQuery;
  const searchDraft = String(ui.projectSearchDraft ?? searchQuery);

  return `
    <section class="project-gallery-shell">
      <header class="project-gallery-header">
        <div class="page-seo-heading">
          <h1>全部项目(${snapshot.totalProjects})</h1>
          <div class="page-seo-tags" aria-label="项目能力">
            <b>视频短剧制作工具</b>
            <b>AI短剧制作</b>
            <b>AI漫剧制作</b>
            <b>剧本到分镜</b>
            <b>视频短剧生产</b>
          </div>
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
          ${isTeamMember ? "" : `<button class="gallery-toolbar-button danger" type="button" data-action="delete-selected-projects" ${selectedCount ? "" : "disabled"}>删除所选</button>`}
        </div>
      </div>
      <section class="project-gallery-grid" aria-label="项目列表">
        ${
          snapshot.totalProjects
            ? snapshot.pageProjects.map((project) => renderProjectCard(
                project,
                ui.projectCardMenuId === project.id,
                selectedIds.has(String(project.id ?? "")),
                !isTeamMember,
              )).join("")
            : isTeamMember && !searchQuery
              ? renderTeamMemberAssignmentEmptyState("项目")
              : renderEmptyProjectState(searchQuery, [])
        }
      </section>
      ${renderInlineStatusToast(ui)}
      ${snapshot.totalProjects ? renderProjectGalleryPagination(snapshot.totalProjects, snapshot.currentPage, snapshot.totalPages, snapshot.projectsPerPage) : ""}
      <div class="project-gallery-footer">
        ${isTeamMember ? "" : `<button class="hero-cta gallery-create-button" type="button" data-action="open-create-modal">创建项目</button>`}
      </div>
    </section>
  `;
}

function renderTeamMemberAssignmentEmptyState(resourceLabel) {
  return `<div class="team-member-assignment-empty-state" role="status">
    <strong>暂无${escapeHtml(resourceLabel)}</strong>
    <span>请联系管理员分配${escapeHtml(resourceLabel)}</span>
  </div>`;
}

export function getProjectGallerySnapshot(ui = {}) {
  const projects = Array.isArray(ui.projectLibrary) ? ui.projectLibrary : [];
  const searchQuery = String(ui.projectSearchQuery ?? "").trim();
  const pagination = normalizeProjectGalleryPagination(ui.projectLibraryPagination, projects.length);
  const totalProjects = pagination.total;
  const totalPages = pagination.totalPages;
  const currentPage = Math.min(Math.max(1, Number(ui.projectLibraryPage ?? pagination.page)), totalPages);
  const pageProjects = projects.length <= pagination.pageSize
    ? projects
    : projects.slice((currentPage - 1) * pagination.pageSize, currentPage * pagination.pageSize);
  return {
    searchQuery,
    filteredProjects: projects,
    projectsPerPage: pagination.pageSize,
    totalProjects,
    totalPages,
    currentPage,
    pageProjects,
  };
}

export function resolveProjectGalleryPageSize(ui = {}) {
  return normalizeProjectGalleryPagination(
    ui.projectLibraryPagination,
    0,
    PROJECT_GALLERY_DEFAULT_PAGE_SIZE,
  ).pageSize;
}

function normalizeProjectGalleryPagination(value, fallbackTotal, fallbackPageSize = PROJECT_GALLERY_DEFAULT_PAGE_SIZE) {
  const pageSize = fallbackPageSize;
  const total = Math.max(0, Number(value?.total ?? fallbackTotal ?? 0));
  const totalPages = Math.max(1, Number(value?.totalPages ?? Math.ceil(total / pageSize) ?? 1));
  const page = Math.min(totalPages, Math.max(1, Number(value?.page ?? 1)));
  return {
    page,
    pageSize,
    total,
    totalPages,
  };
}

function normalizeSelectedProjectIds(value) {
  return new Set(
    (Array.isArray(value) ? value : [])
      .map((id) => String(id ?? "").trim())
      .filter(Boolean),
  );
}

function renderProjectGalleryPagination(
  totalProjects,
  currentPage,
  totalPages,
  pageSize,
  ariaLabel = "项目分页",
  actionName = "change-project-page",
) {
  const pages = buildProjectPageItems(currentPage, totalPages);
  return `
    <footer class="project-gallery-pagination" aria-label="${escapeHtml(ariaLabel)}">
      <div class="project-gallery-pagination-summary">
        <span>共 ${totalProjects} 条</span>
        <span>${pageSize} 条/页</span>
      </div>
      <div class="project-gallery-pagination-controls">
        <button
          class="project-gallery-page-button"
          type="button"
          data-action="${escapeAttr(actionName)}"
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
                  data-action="${escapeAttr(actionName)}"
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
          data-action="${escapeAttr(actionName)}"
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

function renderProjectCard(project, isMenuOpen, isSelected = false, canDelete = true) {
  const hasCover = Boolean(project.coverImageUrl);
  const coverInputId = `project-cover-input-${escapeHtml(project.id)}`;
  return `
    <article class="project-gallery-card ${isSelected ? "is-selected" : ""}" data-action="open-project-detail" data-project-id="${escapeHtml(project.id)}">
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
          ${isMenuOpen ? renderProjectCardMenu(project, canDelete) : ""}
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

function renderProjectCardMenu(project, canDelete = true) {
  const menuCoverInputId = `project-cover-menu-input-${escapeHtml(project.id)}`;
  return `
    <div class="project-card-menu" role="menu" aria-label="项目操作">
      <input id="${menuCoverInputId}" class="project-cover-input" type="file" accept="image/*" data-action="upload-project-cover" data-project-id="${escapeHtml(project.id)}" />
      <label class="project-card-menu-item" for="${menuCoverInputId}" data-action="pick-project-cover" data-project-id="${escapeHtml(project.id)}">上传封面</label>
      <button class="project-card-menu-item" type="button" data-action="rename-project-card" data-project-id="${escapeHtml(project.id)}">重命名</button>
      ${canDelete ? `<button class="project-card-menu-item danger" type="button" data-action="delete-project-card" data-project-id="${escapeHtml(project.id)}">删除</button>` : ""}
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

function renderCanvasDirectorCaptureDeleteModal(target) {
  if (!target) {
    return "";
  }
  const mediaLabel = target.mediaKind === "video" ? "视频" : "图片";
  return `
    <section class="modal-backdrop delete-project-backdrop" role="dialog" aria-modal="true" aria-label="确认删除导演台${mediaLabel}">
      <div class="delete-project-modal canvas-director-capture-delete-modal">
        <div class="delete-project-head">
          <div class="delete-project-icon">×</div>
          <div>
            <h2>确认删除</h2>
            <p>删除后将从当前导演台节点中移除，确定删除这个${mediaLabel}吗？</p>
          </div>
          <button class="modal-close" type="button" data-action="close-canvas-director-capture-delete-modal" aria-label="关闭">×</button>
        </div>
        <div class="delete-project-actions">
          <button class="secondary-action delete-cancel-button" type="button" data-action="close-canvas-director-capture-delete-modal">取消</button>
          <button class="delete-confirm-button" type="button" data-action="confirm-canvas-director-capture-delete">确定删除</button>
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

  return "";
}

function filterProjects(projects, searchQuery, ui = {}) {
  if (!searchQuery) {
    return projects;
  }

  const normalizedQuery = normalizeProjectSearchText(searchQuery);
  const compactQuery = normalizedQuery.replace(/\s+/g, "");
  return projects.filter((project) => {
    const searchableText = buildProjectSearchText(project);
    return searchableText.includes(normalizedQuery) || (compactQuery && searchableText.replace(/\s+/g, "").includes(compactQuery));
  });
}

function buildProjectSearchText(project) {
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
  ]
    .map(normalizeProjectSearchText)
    .filter(Boolean)
    .join(" ");
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
  const tabButton = `
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
  return tabButton;
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
    camera: `
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="m16 10 5-3v10l-5-3" />
      <path d="M7 10h5" />
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
    plus: `
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    `,
    sparkles: `
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      <path d="M20 3v4" />
      <path d="M22 5h-4" />
      <path d="M4 17v2" />
      <path d="M5 18H3" />
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
  const currentState = state && typeof state === "object" ? state : {};
  const steps = [
    Boolean(currentState.project),
    Boolean(currentState.shots?.length),
    Boolean(currentState.assetReview?.readyForGeneration),
    Boolean(currentState.calibration),
    Boolean(currentState.shots?.length && currentState.shots.every((shot) => shot.currentImageAssetVersionId)),
    Boolean(currentState.shots?.length && currentState.shots.every((shot) => shot.currentVideoAssetVersionId)),
    Boolean(currentState.exportPreview),
  ];

  return {
    readySteps: steps.filter(Boolean).length,
    totalSteps: steps.length,
  };
}
