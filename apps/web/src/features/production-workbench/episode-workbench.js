import { normalizeStoryboardIndices } from "./storyboard-state.js";
import { disabled, escapeAttr, escapeHtml } from "./markup.js";

const MEDIA_TABS = [
  { id: "image", label: "做图片" },
  { id: "video", label: "做视频" },
  { id: "lip-sync", label: "对口型" },
];

const ASSET_TABS = [
  { id: "character", label: "角色" },
  { id: "scene", label: "场景" },
  { id: "prop", label: "道具" },
];

const FALLBACK_ASSETS = {
  character: [
    { id: "mock-character-1", name: "李右", description: "黑发青年主角，红黑外套，正面、半身与转身状态统一。", preview: "" },
    { id: "mock-character-2", name: "灰雀羽毛", description: "灰白羽毛元素，用于特写镜头和落地动态补充。", preview: "" },
    { id: "mock-character-3", name: "白野", description: "冷淡坚韧的废土行者，站姿稳定，适合主镜头反打。", preview: "" },
    { id: "mock-character-4", name: "食人花树", description: "扭曲异植，树干带巨口，根须向外扩张形成压迫感。", preview: "" },
    { id: "mock-character-5", name: "机械四肢", description: "军用损毁机械腿部与臂部部件，用于残骸飞散镜头。", preview: "" },
    { id: "mock-character-6", name: "制式步枪", description: "冷灰长枪，枪身带磨损感，适合战损风格近景。", preview: "" },
  ],
  scene: [
    { id: "mock-scene-1", name: "黑山密林吞噬区", description: "潮湿、压抑、带腐蚀气雾的异植森林。", preview: "" },
    { id: "mock-scene-2", name: "午午腐蚀暗影", description: "高反差阴影和绿色冷光共存，适合爆炸后背光。", preview: "" },
    { id: "mock-scene-3", name: "断根裂地", description: "树根断裂、藤蔓抽打、地面尘屑飞散的动作区域。", preview: "" },
    { id: "mock-scene-4", name: "爆炸烟柱", description: "亮橙火团与黑灰烟尘向外翻卷，增强冲击层次。", preview: "" },
  ],
  prop: [
    { id: "mock-prop-1", name: "制式步枪", description: "长枪轮廓利落，适合角色持枪近景。", preview: "" },
    { id: "mock-prop-2", name: "子弹", description: "黄铜弹药与黑色弹头组合，用于道具特写。", preview: "" },
    { id: "mock-prop-3", name: "包扎物", description: "旧医疗绷带和破布包，用于废土感补强。", preview: "" },
    { id: "mock-prop-4", name: "金属残片", description: "爆炸后飞散的机械碎片，增强动作信息量。", preview: "" },
  ],
};

export const EPISODE_WORKBENCH_FALLBACK_ASSET_IDS = Object.values(FALLBACK_ASSETS)
  .flat()
  .map((item) => item.id);

const FALLBACK_QUICK_ASSETS = [
  { id: "quick-1", name: "李右/破...", kind: "character" },
  { id: "quick-2", name: "灰雀羽毛...", kind: "character" },
  { id: "quick-3", name: "制式步枪", kind: "prop" },
  { id: "quick-4", name: "包扎物", kind: "prop" },
  { id: "quick-5", name: "白野", kind: "character" },
  { id: "quick-6", name: "子弹/制...", kind: "prop" },
  { id: "quick-7", name: "黑山密林...", kind: "scene" },
];

const FALLBACK_STORYBOARDS = [
  {
    id: "mock-board-1",
    index: 1,
    title: "白野用机械腿引爆食人花树，爆炸后转身立威",
    description:
      "故事发生场景：（黑山密林吞噬区/正午腐蚀暗影） 分镜过渡（00:00-00:01）：镜头1（00:01-00:04）：视觉：白野站在断根与腐叶之间，右臂后摆蓄力，将机械腿残骸猛地掷向前方的食人花树。",
    references: FALLBACK_QUICK_ASSETS.slice(0, 5),
  },
];

export function renderEpisodeWorkbench({
  storyboards = [],
  selectedStoryboard = null,
  assetLibrary = {},
  activeAssetTab = "character",
  selectedEpisodeAssetId = null,
  selectedEpisodeAssetIds = [],
  isStoryboardDescriptionModalOpen = false,
  storyboardDescriptionDraft = "",
  selectedModelId = "vidu-q3-pro",
  prompt = "",
  busy = false,
  canGenerateImages = true,
  canGenerateVideos = true,
  validationMessage = "",
  mediaMode = "image",
  generationControls = {},
  generationUiState = {},
  storyboardDeleteTarget = null,
  storyboardImageDeleteTarget = null,
  storyboardVideoDeleteTarget = null,
  episodeAssetCreateModal = null,
  assetInspector = null,
  episodeWorkbenchAttachments = [],
  episodeVoiceModal = null,
} = {}) {
  const scopeMode = generationUiState.museScopeMode ?? "assets";
  const boardMode = generationUiState.museBoardMode ?? "operation";
  const assetGroups = {
    character: assetLibrary.character ?? [],
    scene: assetLibrary.scene ?? [],
    prop: assetLibrary.prop ?? [],
  };
  const activeAssets = (assetGroups[activeAssetTab] ?? []).length
    ? assetGroups[activeAssetTab]
    : FALLBACK_ASSETS[activeAssetTab] ?? [];
  const normalizedStoryboards = storyboards.length
    ? normalizeStoryboardIndices(storyboards)
    : FALLBACK_STORYBOARDS;
  const currentStoryboard =
    normalizedStoryboards.find((item) => item.id === selectedStoryboard?.id) ??
    normalizedStoryboards[0] ??
    null;
  const selectedAsset =
    activeAssets.find((item) => item.id === selectedEpisodeAssetId) ??
    activeAssets[0] ??
    null;
  const quickAssets = [...assetGroups.character, ...assetGroups.scene, ...assetGroups.prop].length
    ? [...assetGroups.character, ...assetGroups.scene, ...assetGroups.prop].slice(0, 12)
    : FALLBACK_QUICK_ASSETS;
  const allAssetIds = [
    ...(assetGroups.character.length ? assetGroups.character : FALLBACK_ASSETS.character),
    ...(assetGroups.scene.length ? assetGroups.scene : FALLBACK_ASSETS.scene),
    ...(assetGroups.prop.length ? assetGroups.prop : FALLBACK_ASSETS.prop),
  ].map((item) => item.id);
  const isAllSelected =
    allAssetIds.length > 0 && allAssetIds.every((id) => selectedEpisodeAssetIds.includes(id));
  const canGenerateCurrentMode =
    mediaMode === "video" || mediaMode === "lip-sync"
      ? canGenerateVideos
      : canGenerateImages;
  const imageDeleteTargetStoryboard =
    normalizedStoryboards.find((item) => item.id === storyboardImageDeleteTarget?.storyboardId) ?? null;
  const imageDeleteTarget =
    (imageDeleteTargetStoryboard?.uploadedImages ?? []).find((item) => item.id === storyboardImageDeleteTarget?.imageId) ?? null;
  const videoDeleteTargetStoryboard =
    normalizedStoryboards.find((item) => item.id === storyboardVideoDeleteTarget?.storyboardId) ?? null;
  const videoDeleteTarget =
    (videoDeleteTargetStoryboard?.uploadedVideos ?? []).find((item) => item.id === storyboardVideoDeleteTarget?.videoId) ?? null;

  return `
    <section id="storyboard-workbench" class="episode-replica-shell" aria-label="分镜工作台">
      <header class="episode-replica-topbar">
        <div class="episode-replica-topbar-left">
          <button class="episode-replica-return" type="button" data-action="back-to-episode-hub">
            <span>‹</span><strong>返回</strong>
          </button>
          <span class="episode-replica-timestamp">2026-05-27 15:48:37</span>
        </div>
        <div class="episode-replica-topbar-center">
          <button class="episode-replica-pill ${isAllSelected ? "active" : ""}" type="button" data-action="toggle-episode-asset-select-all">全选</button>
          <button class="episode-replica-pill wide" type="button">批量生图/视频 | 高清处理</button>
        </div>
        <div class="episode-replica-topbar-right">
          <div class="episode-replica-main-switch">
            <button class="${scopeMode === "assets" ? "active" : ""}" type="button" data-action="set-muse-scope-mode" data-mode="assets">角色/场景</button>
            <button class="${scopeMode === "storyboard" ? "active" : ""}" type="button" data-action="set-muse-scope-mode" data-mode="storyboard">分镜</button>
          </div>
          <button class="episode-replica-export" type="button">✈ 导出</button>
        </div>
      </header>

      <div class="episode-replica-layout ${scopeMode === "storyboard" ? "storyboard-mode" : "assets-mode"}">
        <section class="episode-replica-left">
          ${
            scopeMode === "assets"
              ? renderAssetWorkspace(activeAssetTab, activeAssets, selectedAsset, selectedEpisodeAssetIds)
              : renderStoryboardWorkspace(normalizedStoryboards, currentStoryboard, boardMode)
          }
        </section>

        <section class="episode-replica-center">
          <div class="episode-replica-stage-head">
            <div class="episode-replica-stage-tabs">
              ${MEDIA_TABS.map((tab) => renderMediaTab(tab, mediaMode)).join("")}
            </div>
            <p class="episode-replica-stage-title">${
              scopeMode === "storyboard"
                ? `分镜: ${escapeHtml(currentStoryboard?.title ?? "")}`
                : `${escapeHtml(resolveAssetLabel(activeAssetTab))}: ${escapeHtml(selectedAsset?.name ?? "")}`
            }</p>
          </div>
          <div class="episode-replica-stage-body">
            ${
              scopeMode === "storyboard"
                ? renderStoryboardStage(currentStoryboard, mediaMode === "lip-sync" ? "video" : mediaMode)
                : renderAssetPreview(selectedAsset, activeAssetTab)
            }
          </div>
          ${renderPromptDock({
            selectedStoryboard: currentStoryboard,
            selectedAsset,
            selectedModelId,
            prompt,
            busy,
            canGenerateCurrentMode,
            validationMessage,
            generationControls,
            generationUiState,
            mediaMode,
            attachments: episodeWorkbenchAttachments,
          })}
        </section>

        <aside class="episode-replica-right">
          <div class="episode-replica-right-head">
            <strong>资产快捷栏</strong>
            <span>⌕</span>
          </div>
          <div class="episode-replica-right-list">
            ${quickAssets.map((asset, index) => renderQuickAsset(asset, index === 0)).join("")}
          </div>
        </aside>
      </div>

      ${renderStoryboardDescriptionModal({
        show: isStoryboardDescriptionModalOpen,
        value: storyboardDescriptionDraft,
        selectedStoryboard: currentStoryboard,
      })}
      ${renderStoryboardDeleteModal({
        show: Boolean(storyboardDeleteTarget),
        storyboard: normalizedStoryboards.find((item) => item.id === storyboardDeleteTarget) ?? null,
      })}
      ${renderStoryboardImageDeleteModal({
        show: Boolean(storyboardImageDeleteTarget?.storyboardId && storyboardImageDeleteTarget?.imageId),
        storyboard: imageDeleteTargetStoryboard,
        image: imageDeleteTarget,
      })}
      ${renderStoryboardVideoDeleteModal({
        show: Boolean(storyboardVideoDeleteTarget?.storyboardId && storyboardVideoDeleteTarget?.videoId),
        storyboard: videoDeleteTargetStoryboard,
        video: videoDeleteTarget,
      })}
      ${renderEpisodeAssetCreateModal(episodeAssetCreateModal)}
      ${renderEpisodeVoiceModal(episodeVoiceModal)}
      ${renderAssetInspectorModal(assetInspector)}
    </section>
  `;
}

function resolveAssetLabel(tab) {
  return ASSET_TABS.find((item) => item.id === tab)?.label ?? "素材";
}

function renderAssetWorkspaceLegacy(activeAssetTab, activeAssets, selectedAsset, selectedEpisodeAssetIds) {
  const groups = ASSET_TABS.map((tab) => ({
    ...tab,
    assets: (FALLBACK_ASSETS[tab.id] ?? []).map((asset) => asset),
  }));
  const liveGroups = {
    character: activeAssetTab === "character" && activeAssets.length ? activeAssets : groups.find((item) => item.id === "character")?.assets ?? [],
    scene: activeAssetTab === "scene" && activeAssets.length ? activeAssets : groups.find((item) => item.id === "scene")?.assets ?? [],
    prop: activeAssetTab === "prop" && activeAssets.length ? activeAssets : groups.find((item) => item.id === "prop")?.assets ?? [],
  };
  return `
    <div class="episode-replica-asset-toolbar unified">
      <div class="episode-replica-asset-toolbar-main">
        <div class="episode-replica-asset-tabs">
          ${ASSET_TABS.map((tab) => `
            <button class="${tab.id === activeAssetTab ? "active" : ""}" type="button" data-action="set-project-asset-tab" data-asset-tab="${escapeAttr(tab.id)}">${escapeHtml(tab.label)}</button>
          `).join("")}
        </div>
        <div class="episode-replica-asset-actions">
          <button type="button" data-action="open-episode-asset-create-modal">手动添加</button>
          <button type="button" data-action="open-asset-import-modal" data-asset-kind="${escapeAttr(activeAssetTab)}">资产库选取</button>
        </div>
      </div>
      <div class="episode-replica-asset-sections">
        ${ASSET_TABS.map((tab) => `
          <section class="episode-replica-asset-section ${escapeAttr(tab.id)}-mode" data-episode-asset-group="${escapeAttr(tab.id)}">
            <div class="episode-replica-asset-grid ${escapeAttr(tab.id)}-mode">
              ${(liveGroups[tab.id] ?? []).map((asset, index) => renderAssetCard(
                asset,
                tab.id,
                tab.id === activeAssetTab && (asset.id === selectedAsset?.id || (!selectedAsset && index === 0)),
                selectedEpisodeAssetIds.includes(asset.id),
              )).join("")}
            </div>
          </section>
        `).join("")}
      </div>
    </div>
  `;
}

function renderAssetCardLegacy(asset, assetKind, active, checked) {
  const desc = String(asset?.description ?? "").trim() || "";
  const title = assetKind === "scene" ? "编辑场景" : assetKind === "prop" ? "编辑道具" : "编辑角色";
  return `
    <article class="episode-replica-asset-card ${active ? "active" : ""} ${checked ? "checked" : ""}" data-asset-card="${escapeAttr(asset?.id ?? "")}">
      <button class="episode-replica-asset-select" type="button" data-action="set-episode-asset" data-asset-id="${escapeAttr(asset?.id ?? "")}">
        <button class="pick ${checked ? "checked" : ""}" type="button" data-action="toggle-episode-asset-selection" data-asset-id="${escapeAttr(asset?.id ?? "")}" aria-label="选择素材"></button>
        <strong class="name">${escapeHtml(asset?.name ?? "测试")}</strong>
        <span class="title">${escapeHtml(title)}</span>
      </button>
      <span class="toolbar">✦</span>
      <span class="label">${escapeHtml(resolveAssetLabel(assetKind))}固定</span>
      <span class="label">${escapeHtml(resolveAssetLabel(assetKind))}描述</span>
      <span class="preview">${renderPlaceholderArt(assetKind, asset?.name ?? "")}</span>
      ${assetKind === "character" ? `<button class="voice" type="button" data-action="open-episode-voice-modal" data-asset-id="${escapeAttr(asset?.id ?? "")}" data-asset-name="${escapeAttr(asset?.name ?? "角色")}">+ 配音员</button>` : ""}
      <label class="episode-replica-asset-desc-wrap">
        <textarea
          class="episode-replica-asset-desc-input"
          data-asset-id="${escapeAttr(asset?.id ?? "")}"
          data-asset-kind="${escapeAttr(assetKind)}"
          placeholder="可以编辑，点击框外后自动保存"
        >${escapeHtml(desc)}</textarea>
      </label>
      <span class="count">${[...desc].length} / 800</span>
    </article>
  `;
}

function renderStoryboardWorkspace(storyboards, selectedStoryboard, boardMode) {
  return `
    <div class="episode-replica-storyboard-toolbar">
      <div class="episode-replica-storyboard-board-tabs">
        <button class="${boardMode === "operation" ? "active" : ""}" type="button" data-action="set-muse-board-mode" data-mode="operation">操作栏</button>
        <button class="${boardMode === "story" ? "active" : ""}" type="button" data-action="set-muse-board-mode" data-mode="story">故事栏</button>
      </div>
      <button class="episode-replica-add-shot" type="button" data-action="add-storyboard">+</button>
    </div>
    <div class="episode-replica-storyboard-grid">
      ${boardMode === "story" ? renderStoryBoardPreview(selectedStoryboard) : storyboards.map((storyboard, index) => renderStoryboardCard(storyboard, storyboard.id === selectedStoryboard?.id || (!selectedStoryboard && index === 0))).join("")}
    </div>
  `;
}

function renderStoryBoardPreview(selectedStoryboard) {
  return `
    <div class="episode-replica-story-preview">
      <div class="episode-replica-story-canvas"></div>
      <div class="episode-replica-story-track"></div>
      <button class="episode-replica-story-frame" type="button" data-action="select-storyboard" data-storyboard-id="${escapeAttr(selectedStoryboard?.id ?? "")}">
        <span>▶</span>
        <strong>${escapeHtml(selectedStoryboard?.title ?? "分镜 1")}</strong>
      </button>
    </div>
  `;
}

function renderStoryboardCard(storyboard, active) {
  const desc = String(storyboard.description ?? "").trim() || "这里是视频描述词";
  const refs = (storyboard.references ?? FALLBACK_QUICK_ASSETS).slice(0, 6);
  return `
    <button class="episode-replica-shot-card ${active ? "active" : ""}" type="button" data-action="select-storyboard" data-storyboard-id="${escapeAttr(storyboard.id)}">
      <span class="pick"></span>
      <strong class="title">分镜 ${escapeHtml(String(storyboard.index ?? 1))}: ${escapeHtml(storyboard.title ?? "")}</strong>
      <span class="meta">角色 / 场景 / 道具</span>
      <span class="tabs">做图片　做视频</span>
      <span class="desc">${escapeHtml(desc)}</span>
      <span class="count">${[...desc].length} / 3000</span>
      <span class="preview">${renderStoryboardPreviewThumb(refs)}</span>
      <span class="preview-title">分镜剧情</span>
      <span class="edit">编辑分镜</span>
    </button>
  `;
}

function renderAssetPreview(asset, activeAssetTab) {
  return `
    <div class="episode-replica-asset-preview">
      <div class="episode-replica-preview-card">
        <div class="episode-replica-preview-hero">${renderPlaceholderArt(activeAssetTab, asset?.name ?? "")}</div>
        <div class="episode-replica-preview-copy">
          <strong>${escapeHtml(asset?.name ?? "李右")}</strong>
          <p>${escapeHtml(asset?.description ?? "保留废土感和机械感，适合作为快速引用资产。")}</p>
        </div>
      </div>
    </div>
  `;
}

function renderQuickAsset(asset, active) {
  const kind = asset.kind || inferKind(asset.name);
  return `
    <button class="episode-replica-quick-asset ${active ? "active" : ""}" type="button" data-action="set-episode-asset" data-asset-id="${escapeAttr(asset.id ?? "")}">
      <span class="thumb">${renderQuickPlaceholder(kind, asset.name ?? "素材")}</span>
      <strong>${escapeHtml(asset.name ?? "素材")}</strong>
    </button>
  `;
}

function renderPromptDock({
  selectedStoryboard,
  selectedAsset,
  selectedModelId,
  prompt,
  busy,
  canGenerateCurrentMode = true,
  validationMessage,
  generationControls,
  generationUiState,
  mediaMode,
  attachments = [],
}) {
  const promptValue = prompt || selectedStoryboard?.description || selectedAsset?.description || "请填写分镜描述，记录分镜对应的画面内容。";
  const aspectRatio = generationControls.imageAspectRatio ?? "16:9";
  const resolution = generationControls.imageResolution ?? "2K";
  const duration = generationControls.videoDurationSec ?? "5";
  const activePromptMenu = generationUiState.musePromptMenu ?? null;
  const openGenerationSelectMenu = generationUiState.openGenerationSelectMenu ?? null;
  const models = [
    { id: "jimeng-4-5", label: "全能参考2.0 Fast（9图完整版/不可真人）" },
    { id: "seedance-2-0-vip", label: "nano banana 2（链路G）" },
    { id: "vidu-q3-pro", label: "SeeDance2.0 Fast 按秒计费（链路E）" },
  ];
  const selectedModel = models.find((item) => item.id === selectedModelId) ?? models[0];
  return `
    <section class="episode-replica-prompt">
      <div class="episode-replica-ref-strip">
        <button class="episode-replica-ref-card voice uploadable" type="button" data-action="open-episode-workbench-attachment-picker" data-attachment-type="audio">
          <span>↑</span><strong>音频 1</strong>
        </button>
        <button class="episode-replica-upload-card" type="button" data-action="open-episode-workbench-attachment-picker" data-attachment-type="image">
          <span>↑</span><strong>图片</strong>
        </button>
        ${(attachments ?? []).map((item, index) => renderAttachment(item, index)).join("")}
        <input class="episode-workbench-attachment-input" data-attachment-type="image" type="file" accept="image/*" hidden />
        <input class="episode-workbench-attachment-input" data-attachment-type="audio" type="file" accept="audio/*" hidden />
      </div>
      <div class="episode-replica-prompt-tools">
        ${renderMiniMenu("references", "全能参考", activePromptMenu, [
          ["multi", "多参考图"],
          ["single", "单图参考"],
          ["rewrite", "文生图"],
        ])}
        ${renderMiniMenu("preset", "预设: 无预设", activePromptMenu, [["none", "无预设"]], "select-muse-preset")}
        <button class="episode-replica-mini" type="button" data-action="quick-append-selected-asset">快捷引用</button>
      </div>
      <label class="episode-replica-textarea">
        <textarea id="video-prompt-input" placeholder="请输入您的生图要求">${escapeHtml(promptValue)}</textarea>
        <span class="magic">✎</span>
        <em>${[...promptValue].length} / 5000</em>
      </label>
      <div class="episode-replica-prompt-footer">
        <div class="episode-replica-prompt-selects">
          ${renderControlMenu("model", selectedModel.label, openGenerationSelectMenu, models.map((item) => [item.id, item.label]), "select-video-model")}
          ${renderControlMenu("imageResolution", resolution, openGenerationSelectMenu, [["720p", "720p"], ["1K", "1K"], ["2K", "2K"]])}
          ${renderControlMenu("imageAspectRatio", aspectRatio, openGenerationSelectMenu, [["16:9", "16:9"], ["9:16", "9:16"], ["1:1", "1:1"]])}
          ${renderControlMenu("videoDurationSec", `${duration}秒`, openGenerationSelectMenu, [["5", "5秒"], ["10", "10秒"], ["15", "15秒"]])}
        </div>
        <button class="episode-replica-generate" type="button" data-action="${mediaMode === "video" || mediaMode === "lip-sync" ? "generate-videos" : "generate-images"}" ${disabled(busy || !canGenerateCurrentMode)}>
          <span>⚡ 4500</span>
          <strong>生成</strong>
        </button>
      </div>
      <p class="episode-replica-validation">${escapeHtml(validationMessage)}</p>
    </section>
  `;
}

function renderAttachment(item, index) {
  return `
    <article class="episode-replica-ref-card attachment ${escapeAttr(item.type ?? "image")}">
      <button class="episode-replica-ref-remove" type="button" data-action="remove-episode-workbench-attachment" data-attachment-id="${escapeAttr(item.id ?? "")}">×</button>
      <span class="episode-replica-ref-art ${escapeAttr(item.type ?? "image")}">${item.type === "audio" ? "<i>♪</i>" : renderQuickPlaceholder("image", item.name ?? "图片")}</span>
      <strong>${escapeHtml(item.type === "audio" ? `音频 ${index + 1}` : item.name ?? `图片 ${index + 1}`)}</strong>
    </article>
  `;
}

function renderMiniMenu(menu, label, activeMenu, options, action = "select-generation-field-option") {
  const active = activeMenu === menu;
  return `
    <span class="episode-replica-mini-wrap">
      <button class="episode-replica-mini ${active ? "active" : ""}" type="button" data-action="toggle-muse-prompt-menu" data-menu="${escapeAttr(menu)}">${escapeHtml(label)}</button>
      ${active ? `<span class="episode-replica-float-menu">${options.map(([value, text]) => `<button type="button" data-action="${escapeAttr(action)}" data-field="${escapeAttr(menu)}" data-value="${escapeAttr(value)}">${escapeHtml(text)}</button>`).join("")}</span>` : ""}
    </span>
  `;
}

function renderControlMenu(field, label, openMenu, options, action = "select-generation-field-option") {
  const open = openMenu === field;
  return `
    <span class="episode-replica-control-wrap">
      <button class="episode-replica-control" type="button" data-action="toggle-generation-select-menu" data-field="${escapeAttr(field)}">${escapeHtml(label)}</button>
      ${open ? `<span class="episode-replica-float-menu compact">${options.map(([value, text]) => `<button type="button" data-action="${escapeAttr(action)}" ${action === "select-video-model" ? `data-model-id="${escapeAttr(value)}" data-model-name="${escapeAttr(text)}"` : `data-field="${escapeAttr(field)}" data-value="${escapeAttr(value)}"`}>${escapeHtml(text)}</button>`).join("")}</span>` : ""}
    </span>
  `;
}

function renderMediaTab(tab, activeMode) {
  const isActive = tab.id === activeMode || (tab.id === "video" && activeMode === "lip-sync");
  return `<button class="episode-replica-stage-tab ${isActive ? "active" : ""}" type="button" data-action="set-episode-media-mode" data-mode="${escapeAttr(tab.id)}">${escapeHtml(tab.label)}</button>`;
}

function renderStoryboardStage(selectedStoryboard, mediaMode) {
  if (mediaMode === "video") {
    return renderVideoStage(selectedStoryboard);
  }
  return renderImageStage(selectedStoryboard);
}

function renderImageStage(selectedStoryboard) {
  return `
    <div class="episode-replica-generated-stage">
      <div class="episode-replica-stage-actions">
        <button type="button">✳ 重新编辑</button>
        <button type="button">🖼 设为分镜视频</button>
        <button type="button">↓ 下载</button>
        <button type="button">🗑 删除</button>
      </div>
      ${renderResultPanel(selectedStoryboard)}
      <div class="episode-replica-generated-preview">${renderStageCanvas()}</div>
    </div>
  `;
}

function renderVideoStage(selectedStoryboard) {
  return `
    <div class="episode-replica-generated-stage">
      <div class="episode-replica-stage-actions">
        <button type="button">✳ 重新编辑</button>
        <button type="button">↓ 下载</button>
        <button type="button">🗑 删除</button>
      </div>
      ${renderResultPanel(selectedStoryboard)}
      <div class="episode-replica-generated-preview video">${renderStageCanvas(true)}</div>
    </div>
  `;
}

function renderResultPanel(selectedStoryboard) {
  const references = (selectedStoryboard?.references ?? FALLBACK_QUICK_ASSETS).slice(0, 5);
  return `
    <article class="episode-replica-result-panel">
      <div class="copy">${escapeHtml(selectedStoryboard?.description ?? "")}</div>
      <div class="assets">
        <span class="voice">🎙</span>
        ${references.map((item) => `<span class="episode-replica-mini-thumb">${renderQuickPlaceholder(item.kind || inferKind(item.name), item.name)}</span>`).join("")}
        <strong>任务id:423699438108736/全能参考2.0 Fast</strong>
      </div>
      <time>2026-05-27 17:00:36</time>
    </article>
  `;
}

function renderStageCanvas(video = false) {
  return `
    <div class="episode-replica-stage-canvas ${video ? "video" : ""}">
      <div class="episode-replica-canvas-tile large"></div>
      <div class="episode-replica-canvas-tile small"></div>
    </div>
  `;
}

function renderStoryboardDeleteModal({ show, storyboard }) {
  if (!show) return "";
  return `<section class="modal-backdrop delete-project-backdrop" role="dialog" aria-modal="true"><div class="delete-project-modal asset-delete-modal"><div class="delete-project-head"><div class="delete-project-icon">×</div><div><h2>确认删除</h2><p>删除后会清空${storyboard?.title ? `“分镜 ${escapeHtml(String(storyboard.title))}”` : "当前分镜"}的内容，确定继续吗？</p></div><button class="modal-close" type="button" data-action="close-delete-storyboard-modal">×</button></div><div class="delete-project-actions"><button class="secondary-action delete-cancel-button" type="button" data-action="close-delete-storyboard-modal">取消</button><button class="delete-confirm-button" type="button" data-action="confirm-delete-storyboard">确定</button></div></div></section>`;
}

function renderStoryboardVideoDeleteModal({ show, storyboard, video }) {
  if (!show) return "";
  return `<section class="modal-backdrop delete-project-backdrop" role="dialog" aria-modal="true"><div class="delete-project-modal asset-delete-modal"><div class="delete-project-head"><div class="delete-project-icon">×</div><div><h2>确认删除</h2><p>将从${escapeHtml(storyboard?.title ?? "当前分镜")}中删除视频“${escapeHtml(video?.fileName ?? "当前视频")}”。</p></div><button class="modal-close" type="button" data-action="close-delete-storyboard-video-modal">×</button></div><div class="delete-project-actions"><button class="secondary-action delete-cancel-button" type="button" data-action="close-delete-storyboard-video-modal">取消</button><button class="delete-confirm-button" type="button" data-action="confirm-delete-storyboard-video">确定</button></div></div></section>`;
}

function renderStoryboardImageDeleteModal({ show, storyboard, image }) {
  if (!show) return "";
  return `<section class="modal-backdrop delete-project-backdrop" role="dialog" aria-modal="true"><div class="delete-project-modal asset-delete-modal"><div class="delete-project-head"><div class="delete-project-icon">×</div><div><h2>确认删除</h2><p>将从${escapeHtml(storyboard?.title ?? "当前分镜")}中删除图片“${escapeHtml(image?.fileName ?? "当前图片")}”。</p></div><button class="modal-close" type="button" data-action="close-delete-storyboard-image-modal">×</button></div><div class="delete-project-actions"><button class="secondary-action delete-cancel-button" type="button" data-action="close-delete-storyboard-image-modal">取消</button><button class="delete-confirm-button" type="button" data-action="confirm-delete-storyboard-image">确定</button></div></div></section>`;
}

function renderStoryboardDescriptionModal({ show, value, selectedStoryboard }) {
  if (!show || !selectedStoryboard) return "";
  return `<section class="modal-backdrop storyboard-description-backdrop" role="dialog" aria-modal="true"><button class="modal-backdrop-hit" type="button" data-action="close-storyboard-description-modal"></button><div class="single-episode-modal storyboard-description-modal"><div class="single-episode-modal-head storyboard-description-head"><h2>分镜描述</h2><button class="modal-close" type="button" data-action="close-storyboard-description-modal">×</button></div><label class="single-episode-field storyboard-description-field"><textarea id="storyboard-description-input" placeholder="请填写分镜描述">${escapeHtml(value ?? "")}</textarea></label><div class="single-episode-actions storyboard-description-actions"><button class="secondary-action compact" type="button" data-action="close-storyboard-description-modal">取消</button><button class="primary-action compact" type="button" data-action="save-storyboard-description">确认修改</button></div></div></section>`;
}

function renderEpisodeAssetCreateModal(modal) {
  if (!modal?.show) return "";
  return `
    <section class="modal-backdrop storyboard-description-backdrop" role="dialog" aria-modal="true">
      <button class="modal-backdrop-hit" type="button" data-action="close-episode-asset-create-modal"></button>
      <div class="episode-asset-create-modal">
        <button class="episode-asset-create-close" type="button" data-action="close-episode-asset-create-modal">×</button>
        <label class="episode-asset-create-group">
          <span>类型 <em>*</em></span>
          <div class="episode-asset-create-tabs">
            ${ASSET_TABS.map((item) => `<button class="${modal.type === item.id ? "active" : ""}" type="button" data-action="set-episode-asset-create-type" data-type="${escapeAttr(item.id)}">${escapeHtml(item.label)}</button>`).join("")}
          </div>
        </label>
        <label class="episode-asset-create-group">
          <span>名称 <em>*</em></span>
          <div class="episode-asset-create-input-wrap">
            <input id="episode-asset-create-name" type="text" maxlength="20" value="${escapeAttr(modal.name ?? "")}" placeholder="请填写名称" />
            <em>${[...(modal.name ?? "")].length} / 20</em>
          </div>
        </label>
        <button class="episode-asset-create-save" type="button" data-action="save-episode-asset-create" ${disabled(!(modal.name ?? "").trim())}>保存</button>
      </div>
    </section>
  `;
}

function renderEpisodeVoiceModalLegacy(modal) {
  if (!modal) return "";
  return `
    <section class="modal-backdrop storyboard-description-backdrop" role="dialog" aria-modal="true">
      <button class="modal-backdrop-hit" type="button" data-action="close-episode-voice-modal"></button>
      <div class="episode-voice-modal">
        <button class="episode-asset-create-close" type="button" data-action="close-episode-voice-modal">×</button>
        <h3>角色配音</h3>
        <p>为 ${escapeHtml(modal.assetName ?? "角色")} 绑定配音员。</p>
        <label class="episode-asset-create-group">
          <span>配音员名称</span>
          <div class="episode-asset-create-input-wrap">
            <input type="text" value="${escapeAttr(modal.voiceName ?? "")}" placeholder="请输入配音员名称" />
          </div>
        </label>
        <button class="episode-asset-create-save" type="button" data-action="close-episode-voice-modal">确认</button>
      </div>
    </section>
  `;
}

function renderAssetInspectorModal(inspector) {
  if (!inspector) return "";
  const isVideo = inspector.type === "video";
  return `<section class="modal-backdrop storyboard-description-backdrop" role="dialog" aria-modal="true"><button class="modal-backdrop-hit" type="button" data-action="close-asset-inspector"></button><div class="single-episode-modal storyboard-description-modal asset-inspector-modal"><div class="single-episode-modal-head storyboard-description-head"><h2>${escapeHtml(inspector.title ?? (isVideo ? "视频详情" : "图片详情"))}</h2><button class="modal-close" type="button" data-action="close-asset-inspector">×</button></div><div class="asset-inspector-preview">${isVideo ? `<video src="${escapeAttr(inspector.url ?? "")}" controls playsinline preload="metadata"></video>` : `<img src="${escapeAttr(inspector.url ?? "")}" alt="${escapeAttr(inspector.name ?? "素材")}" />`}</div><div class="asset-inspector-meta"><strong>${escapeHtml(inspector.name ?? "未命名素材")}</strong><span>状态：${escapeHtml(inspector.status ?? "ready")}</span></div><div class="single-episode-actions storyboard-description-actions"><button class="primary-action compact" type="button" data-action="close-asset-inspector">关闭</button></div></div></section>`;
}

function renderPlaceholderArt(kind, label) {
  return `
    <span class="episode-replica-placeholder episode-replica-placeholder-${escapeAttr(kind)}">
      <i></i><b>${escapeHtml(label.slice(0, 4) || "素材")}</b>
    </span>
  `;
}

function renderQuickPlaceholder(kind, label) {
  return `
    <span class="episode-replica-quick-art episode-replica-quick-art-${escapeAttr(kind)}">
      <i></i><b>${escapeHtml((label || "素材").slice(0, 4))}</b>
    </span>
  `;
}

function renderStoryboardPreviewThumb(refs) {
  return `
    <span class="episode-replica-shot-preview-art">
      ${refs.slice(0, 4).map((item) => `<span>${renderQuickPlaceholder(item.kind || inferKind(item.name), item.name)}</span>`).join("")}
    </span>
  `;
}

function inferKind(name = "") {
  if (name.includes("枪") || name.includes("弹") || name.includes("机械") || name.includes("包")) return "prop";
  if (name.includes("林") || name.includes("影") || name.includes("暗") || name.includes("区")) return "scene";
  return "character";
}

function renderAssetWorkspace(activeAssetTab, activeAssets, selectedAsset, selectedEpisodeAssetIds) {
  const groups = ASSET_TABS.map((tab) => ({
    ...tab,
    assets: (FALLBACK_ASSETS[tab.id] ?? []).map((asset) => asset),
  }));
  const liveGroups = {
    character: activeAssetTab === "character" && activeAssets.length ? activeAssets : groups.find((item) => item.id === "character")?.assets ?? [],
    scene: activeAssetTab === "scene" && activeAssets.length ? activeAssets : groups.find((item) => item.id === "scene")?.assets ?? [],
    prop: activeAssetTab === "prop" && activeAssets.length ? activeAssets : groups.find((item) => item.id === "prop")?.assets ?? [],
  };
  return `
    <div class="episode-replica-asset-toolbar unified">
      <div class="episode-replica-asset-toolbar-head">
        <div class="episode-replica-asset-toolbar-main">
          <div class="episode-replica-asset-tabs">
            ${ASSET_TABS.map((tab) => `
              <button class="${tab.id === activeAssetTab ? "active" : ""}" type="button" data-action="set-project-asset-tab" data-asset-tab="${escapeAttr(tab.id)}">${escapeHtml(tab.label)}</button>
            `).join("")}
          </div>
          <div class="episode-replica-asset-actions">
            <button type="button" data-action="open-episode-asset-create-modal">鎵嬪姩娣诲姞</button>
            <button type="button" data-action="open-asset-import-modal" data-asset-kind="${escapeAttr(activeAssetTab)}">璧勪骇搴撻€夊彇</button>
          </div>
        </div>
      </div>
      <div class="episode-replica-asset-sections">
        ${ASSET_TABS.map((tab) => `
          <section class="episode-replica-asset-section ${escapeAttr(tab.id)}-mode" data-episode-asset-group="${escapeAttr(tab.id)}">
            <div class="episode-replica-asset-grid ${escapeAttr(tab.id)}-mode">
              ${(liveGroups[tab.id] ?? []).map((asset, index) => renderAssetCard(
                asset,
                tab.id,
                tab.id === activeAssetTab && (asset.id === selectedAsset?.id || (!selectedAsset && index === 0)),
                selectedEpisodeAssetIds.includes(asset.id),
              )).join("")}
            </div>
          </section>
        `).join("")}
      </div>
    </div>
  `;
}

function renderAssetCard(asset, assetKind, active, checked) {
  const desc = String(asset?.description ?? "").trim() || "";
  const title = assetKind === "scene" ? "缂栬緫鍦烘櫙" : assetKind === "prop" ? "缂栬緫閬撳叿" : "缂栬緫瑙掕壊";
  return `
    <article class="episode-replica-asset-card ${active ? "active" : ""} ${checked ? "checked" : ""}" data-asset-card="${escapeAttr(asset?.id ?? "")}">
      <div class="episode-replica-asset-card-head">
        <button class="pick ${checked ? "checked" : ""}" type="button" data-action="toggle-episode-asset-selection" data-asset-id="${escapeAttr(asset?.id ?? "")}" aria-label="閫夋嫨绱犳潗"></button>
        <button class="episode-replica-asset-select" type="button" data-action="set-episode-asset" data-asset-id="${escapeAttr(asset?.id ?? "")}">
          <strong class="name">${escapeHtml(asset?.name ?? "娴嬭瘯")}</strong>
          <span class="title">${escapeHtml(title)}</span>
        </button>
      </div>
      <span class="toolbar">鉁?/span>
      <span class="label">${escapeHtml(resolveAssetLabel(assetKind))}鍥哄畾</span>
      <span class="label">${escapeHtml(resolveAssetLabel(assetKind))}鎻忚堪</span>
      <span class="preview">${renderPlaceholderArt(assetKind, asset?.name ?? "")}</span>
      ${assetKind === "character" ? `<button class="voice" type="button" data-action="open-episode-voice-modal" data-asset-id="${escapeAttr(asset?.id ?? "")}" data-asset-name="${escapeAttr(asset?.name ?? "瑙掕壊")}">+ 閰嶉煶鍛?/button>` : ""}
      <label class="episode-replica-asset-desc-wrap">
        <textarea
          class="episode-replica-asset-desc-input"
          data-asset-id="${escapeAttr(asset?.id ?? "")}"
          data-asset-kind="${escapeAttr(assetKind)}"
          placeholder="鍙互缂栬緫锛岀偣鍑绘澶栧悗鑷姩淇濆瓨"
        >${escapeHtml(desc)}</textarea>
      </label>
      <span class="count">${[...desc].length} / 800</span>
    </article>
  `;
}

function renderEpisodeVoiceModal(modal) {
  if (!modal) return "";
  return `
    <section class="modal-backdrop storyboard-description-backdrop" role="dialog" aria-modal="true">
      <button class="modal-backdrop-hit" type="button" data-action="close-episode-voice-modal"></button>
      <div class="episode-voice-modal">
        <button class="episode-asset-create-close" type="button" data-action="close-episode-voice-modal">脳</button>
        <h3>瑙掕壊閰嶉煶</h3>
        <p>涓?${escapeHtml(modal.assetName ?? "瑙掕壊")} 缁戝畾閰嶉煶鍛樸€?/p>
        <label class="episode-asset-create-group">
          <span>閰嶉煶鍛樺悕绉?/span>
          <div class="episode-asset-create-input-wrap">
            <input type="text" value="${escapeAttr(modal.voiceName ?? "")}" placeholder="璇疯緭鍏ラ厤闊冲憳鍚嶇О" />
          </div>
        </label>
        <div class="episode-voice-modal-note">褰撳墠鍙湁瑙掕壊鍗＄墖鏀寔閰嶉煶椤癸紝鐐瑰嚮鍚庡脊鍑虹獥鍙ｃ€?/div>
        <button class="episode-asset-create-save" type="button" data-action="close-episode-voice-modal">纭</button>
      </div>
    </section>
  `;
}
