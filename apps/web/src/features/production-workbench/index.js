import { renderProjectDetail } from "./project-detail.js";
import { buildProjectCreateRequest } from "./project-create-request.js";
import { validateTeamAssetLocalUploadFile } from "../library-team/asset-library-page.js";
import {
  addStoryboard,
  createEmptyGenerationState,
  createStoryboardList,
  getSelectedStoryboard,
  normalizeStoryboardIndices,
  sortStoryboardsByIndex,
} from "./storyboard-state.js";
import { EPISODE_WORKBENCH_FALLBACK_ASSET_IDS } from "./episode-workbench-rebuilt.js";
import { validateVideoGeneration } from "./video-generation-panel.js";
import { defaultUploadLimits, resolveApiUrl } from "../../shared/creator-api.js";

const DEFAULT_SCRIPT = `Episode 1: Dawn over the mechanical city.

The lead mechanist opens the tower window, sees the industrial skyline, and prepares to launch the first test frame.`;

export function renderProductionWorkbench(context = {}) {
  return renderProjectDetail(context);
}

export function removeTeamAssetLocalUpload(ui, category, uploadId) {
  const uploadsByCategory = ui?.teamAssetLocalUploads ?? {};
  const uploads = uploadsByCategory[category];
  if (!Array.isArray(uploads)) {
    return false;
  }
  const removedUpload = uploads.find((asset) => asset.id === uploadId);
  const nextUploads = uploads.filter((asset) => asset.id !== uploadId);
  if (nextUploads.length === uploads.length) {
    return false;
  }
  revokeTeamAssetLocalUploadUrl(removedUpload);
  ui.teamAssetLocalUploads = {
    ...uploadsByCategory,
    [category]: nextUploads,
  };
  return true;
}

export function resolveTeamAssetLocalUploadInput(target) {
  return (
    target
      ?.closest?.(".library-team-local-upload-toolbar")
      ?.querySelector?.(".team-asset-local-upload-input") ?? null
  );
}

function revokeTeamAssetLocalUploadUrl(asset) {
  const previewUrl = asset?.previewUrl ?? asset?.sourceUrl ?? asset?.url ?? "";
  if (!String(previewUrl).startsWith("blob:")) {
    return;
  }
  if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(previewUrl);
  }
}

export function syncStoryboards(current, next) {
  if (!current.length) {
    return normalizeStoryboardIndices(next);
  }

  const nextByShotId = new Map(
    next.filter((storyboard) => storyboard.linkedShotId).map((storyboard) => [storyboard.linkedShotId, storyboard]),
  );
  const nextById = new Map(next.map((storyboard) => [storyboard.id, storyboard]));
  const usedIds = new Set();

  const merged = current.flatMap((storyboard) => {
    const synced =
      (storyboard.linkedShotId ? nextByShotId.get(storyboard.linkedShotId) : null) ??
      nextById.get(storyboard.id) ??
      null;

    if (!synced) {
      return storyboard.linkedShotId ? [] : [storyboard];
    }

    usedIds.add(synced.id);
    const uploadedVideos = mergeStoryboardUploadedVideos(
      storyboard.uploadedVideos ?? [],
      synced.uploadedVideos ?? [],
      { preserveUploadingOnly: Boolean(storyboard.linkedShotId) },
    );
    const uploadedImages = mergeStoryboardUploadedImages(
      storyboard.uploadedImages ?? [],
      synced.uploadedImages ?? [],
      { preserveUploadingOnly: Boolean(storyboard.linkedShotId) },
    );
    const selectedUploadedVideoId =
      synced.selectedUploadedVideoId !== undefined
        ? synced.selectedUploadedVideoId
        : (storyboard.selectedUploadedVideoId ?? null);
    const mergedStoryboard = {
      ...storyboard,
      ...synced,
      uploadedImages,
      uploadedVideos,
      generationState: mergeGenerationState(storyboard.generationState, synced.generationState),
      selectedUploadedVideoId,
    };
    const pinnedVideo = resolveStoryboardPinnedVideo(mergedStoryboard);
    const previewVideo = pinnedVideo?.src ?? synced.previewVideo ?? storyboard.previewVideo ?? null;
    return [{
      ...mergedStoryboard,
      previewVideo,
      previewThumbnailUrl:
        pinnedVideo?.thumbnailSrc ??
        synced.previewThumbnailUrl ??
        storyboard.previewThumbnailUrl ??
        null,
      previewUrl: resolveStoryboardCombinedPreviewUrl({
        ...mergedStoryboard,
        previewVideo,
      }),
    }];
  });

  const appended = next.filter(
    (storyboard) => !usedIds.has(storyboard.id) && !merged.some((item) => item.id === storyboard.id),
  );

  return normalizeStoryboardIndices(sortStoryboardsByIndex([...merged, ...appended]));
}

export function applyStoryboardScopeUpdate(
  { storyboards = [], episodeStoryboardMap = {}, projectPanelMode = "library", selectedEpisodeId = null } = {},
  updater,
) {
  const isCustomEpisodeScope =
    projectPanelMode === "episode-workbench" && selectedEpisodeId && selectedEpisodeId !== "episode-primary";
  const activeStoryboards = isCustomEpisodeScope
    ? (episodeStoryboardMap?.[selectedEpisodeId] ?? [])
    : storyboards;
  const nextActiveStoryboards = (activeStoryboards ?? []).map(updater);

  if (isCustomEpisodeScope) {
    return {
      storyboards,
      episodeStoryboardMap: {
        ...(episodeStoryboardMap ?? {}),
        [selectedEpisodeId]: nextActiveStoryboards,
      },
      activeStoryboards: nextActiveStoryboards,
    };
  }

  return {
    storyboards: nextActiveStoryboards,
    episodeStoryboardMap,
    activeStoryboards: nextActiveStoryboards,
  };
}

function mergeStoryboardUploadedImages(currentImages, nextImages, options = {}) {
  const preserveUploadingOnly = Boolean(options.preserveUploadingOnly);
  if (!nextImages.length) {
    return preserveUploadingOnly
      ? currentImages.filter((image) => image.status === "uploading")
      : currentImages;
  }

  const mergedImages = (preserveUploadingOnly
    ? currentImages.filter((image) => image.status === "uploading")
    : currentImages
  ).map((image) => ({ ...image }));
  const currentImageIndexById = new Map(mergedImages.map((image, index) => [image.id, index]));

  nextImages.forEach((image) => {
    const matchedIndex = currentImageIndexById.get(image.id);
    if (matchedIndex == null) {
      mergedImages.push({ ...image });
      currentImageIndexById.set(image.id, mergedImages.length - 1);
      return;
    }

    mergedImages[matchedIndex] = {
      ...mergedImages[matchedIndex],
      ...image,
    };
  });

  return mergedImages;
}

function mergeStoryboardUploadedVideos(currentVideos, nextVideos, options = {}) {
  const preserveUploadingOnly = Boolean(options.preserveUploadingOnly);
  if (!nextVideos.length) {
    return preserveUploadingOnly
      ? dedupeStoryboardUploadedVideos(currentVideos.filter(shouldPreserveLinkedStoryboardVideo))
      : dedupeStoryboardUploadedVideos(currentVideos);
  }

  const mergedVideos = (preserveUploadingOnly
    ? currentVideos.filter(shouldPreserveLinkedStoryboardVideo)
    : currentVideos
  ).map((video) => ({ ...video }));
  const sourceMatchedIds = new Set();
  const currentVideoIndexById = new Map(mergedVideos.map((video, index) => [video.id, index]));
  const currentReadyVideos = currentVideos
    .filter((video) => video.status !== "uploading")
    .map((video) => ({ ...video }));
  const currentReadyVideoIndexById = new Map(currentReadyVideos.map((video, index) => [video.id, index]));

  nextVideos.forEach((video) => {
    const matchedIndex = currentVideoIndexById.get(video.id);
    if (matchedIndex == null) {
      const matchedCurrentVideo = findStoryboardVideoMergeCandidate(currentReadyVideos, currentReadyVideoIndexById, video, sourceMatchedIds);
      mergedVideos.push({
        ...matchedCurrentVideo,
        ...video,
        thumbnailSrc: video.thumbnailSrc ?? matchedCurrentVideo?.thumbnailSrc ?? null,
      });
      currentVideoIndexById.set(video.id, mergedVideos.length - 1);
      return;
    }

    const currentVideo = mergedVideos[matchedIndex];
    mergedVideos[matchedIndex] = {
      ...currentVideo,
      ...video,
      thumbnailSrc: video.thumbnailSrc ?? currentVideo?.thumbnailSrc ?? null,
    };
  });

  return dedupeStoryboardUploadedVideos(mergedVideos);
}

function dedupeStoryboardUploadedVideos(videos) {
  const dedupedVideos = [];
  const videoIndexById = new Map();
  const videoIndexBySource = new Map();

  videos.forEach((video) => {
    const normalizedVideo = {
      ...video,
      thumbnailSrc: video?.thumbnailSrc ?? null,
    };
    const sourceKey = resolveStoryboardVideoSourceKey(normalizedVideo);
    const sourceMatchedIndex = sourceKey ? videoIndexBySource.get(sourceKey) : undefined;
    const matchedIndex =
      videoIndexById.get(normalizedVideo.id) ??
      (shouldMergeStoryboardVideosBySource(dedupedVideos[sourceMatchedIndex], normalizedVideo) ? sourceMatchedIndex : undefined);

    if (matchedIndex == null) {
      dedupedVideos.push(normalizedVideo);
      if (normalizedVideo.id) {
        videoIndexById.set(normalizedVideo.id, dedupedVideos.length - 1);
      }
      if (sourceKey) {
        videoIndexBySource.set(sourceKey, dedupedVideos.length - 1);
      }
      return;
    }

    const currentVideo = dedupedVideos[matchedIndex];
    const preferredVideoId = resolvePreferredStoryboardVideoId(currentVideo?.id, normalizedVideo.id);
    dedupedVideos[matchedIndex] = {
      ...currentVideo,
      ...normalizedVideo,
      id: preferredVideoId,
      thumbnailSrc: normalizedVideo.thumbnailSrc ?? currentVideo?.thumbnailSrc ?? null,
    };
    if (currentVideo?.id && currentVideo.id !== preferredVideoId) {
      videoIndexById.delete(currentVideo.id);
    }
    if (preferredVideoId) {
      videoIndexById.set(preferredVideoId, matchedIndex);
    }
    if (sourceKey) {
      videoIndexBySource.set(sourceKey, matchedIndex);
    }
  });

  return dedupedVideos;
}

function resolveStoryboardVideoSourceKey(video) {
  const src = typeof video?.src === "string" ? video.src.trim() : "";
  return src ? `src:${src}` : "";
}

function findStoryboardVideoMergeCandidate(currentVideos, currentVideoIndexById, nextVideo, sourceMatchedIds) {
  const matchedById = currentVideoIndexById.get(nextVideo.id);
  if (matchedById != null) {
    return currentVideos[matchedById] ?? null;
  }

  const sourceKey = resolveStoryboardVideoSourceKey(nextVideo);
  if (!sourceKey) {
    return null;
  }

  for (const currentVideo of currentVideos) {
    const currentSourceKey = resolveStoryboardVideoSourceKey(currentVideo);
    if (currentSourceKey !== sourceKey) {
      continue;
    }
    if (sourceMatchedIds.has(currentVideo.id)) {
      continue;
    }
    if (!shouldMergeStoryboardVideosBySource(currentVideo, nextVideo)) {
      continue;
    }
    if (currentVideo.id) {
      sourceMatchedIds.add(currentVideo.id);
    }
    return currentVideo;
  }

  return null;
}

function shouldMergeStoryboardVideosBySource(currentVideo, nextVideo) {
  if (!currentVideo || !nextVideo) {
    return false;
  }

  const currentSourceKey = resolveStoryboardVideoSourceKey(currentVideo);
  const nextSourceKey = resolveStoryboardVideoSourceKey(nextVideo);
  if (!currentSourceKey || currentSourceKey !== nextSourceKey) {
    return false;
  }

  const currentId = currentVideo.id ?? "";
  const nextId = nextVideo.id ?? "";
  return (
    !currentId ||
    !nextId ||
    isLocalStoryboardVideoId(currentId) ||
    isLocalStoryboardVideoId(nextId)
  );
}

function shouldPreserveLinkedStoryboardVideo(video) {
  return video?.status === "uploading" || isLocalStoryboardVideoId(video?.id);
}

function resolvePreferredStoryboardVideoId(currentId, nextId) {
  if (!currentId) {
    return nextId;
  }
  if (!nextId) {
    return currentId;
  }
  if (isLocalStoryboardVideoId(currentId) && !isLocalStoryboardVideoId(nextId)) {
    return nextId;
  }
  return currentId;
}

function isLocalStoryboardVideoId(videoId) {
  return String(videoId ?? "").startsWith("local-video-");
}

function resolveStoryboardPinnedVideo(storyboard) {
  const uploadedVideos = Array.isArray(storyboard?.uploadedVideos) ? storyboard.uploadedVideos : [];
  if (!uploadedVideos.length) {
    return null;
  }

  const pinnedVideoId = storyboard?.currentVideoAssetVersionId ?? storyboard?.selectedUploadedVideoId ?? null;
  if (!pinnedVideoId) {
    return null;
  }

  return uploadedVideos.find((video) => video.id === pinnedVideoId && video.status === "ready") ?? null;
}

function resolveStoryboardCombinedPreviewUrl(storyboard) {
  const pinnedVideo = resolveStoryboardPinnedVideo(storyboard);
  if (pinnedVideo?.src) {
    return pinnedVideo.src;
  }
  if (storyboard?.previewVideo) {
    return storyboard.previewVideo;
  }
  return storyboard?.previewImageUrl ?? null;
}

const WORKBENCH_STORAGE_PREFIX = "comic-ai:production-workbench";

export async function initProductionWorkbench({ root, session, api, onLogout }) {
  const workbench = {
    root,
    session,
    api,
    onLogout,
    uploadTasks: new Map(),
    librarySearchTimer: null,
    librarySearchRequestId: 0,
    librarySearchComposing: false,
    generationPollTimer: null,
    generationPollStartedAt: null,
    state: null,
    ui: {
      busy: false,
      toast: "Connected to local creator API.",
      validationMessage: "",
      isCreateModalOpen: false,
      createProjectName: "",
      createAspectRatio: "9:16",
      createProjectType: "anime",
      createProjectNotice: "",
      projectLibrary: [],
      projectSearchQuery: "",
      projectLibraryPage: 1,
      projectStatusMenuOpen: false,
      projectStatusFilters: [],
      projectCardMenuId: null,
      projectInteriorStatusMenuOpen: false,
      projectInteriorSection: "overview",
      projectAssetTab: "character",
      selectedEpisodeAssetKind: null,
      selectedEpisodeCardId: null,
      selectedEpisodeAssetId: null,
      selectedEpisodeAssetIds: [],
      episodeAssetCreateModal: null,
      episodeWorkbenchAttachments: [],
      episodeWorkbenchSelectedAttachmentIds: [],
      episodeWorkbenchScrollTarget: null,
      episodeVoiceModal: null,
      episodeBatchModal: null,
      projectOtherAssetMediaType: "video",
      projectMembers: [],
      projectStats: null,
      assetSearchQuery: "",
      assetSortOrder: "desc",
      assetFilterMode: "all",
      assetOnlyMain: false,
      assetViewMode: "grid",
      projectDetail: null,
      assetImportModal: null,
      assetImportModalTab: "local",
      assetImportCategory: "domestic-modern-city",
      assetImportDrafts: [],
      assetImportSelection: [],
      assetLibraryHighlightAssetIds: [],
      assetLibraryHighlightKind: null,
      assetLibraryHighlightMediaType: null,
      assetLibraryHighlightMessage: "",
      assetLibraryPendingFocusAssetIds: [],
      assetCardMenuId: null,
      importedAssets: {
        character: [],
        scene: [],
        prop: [],
        other: {
          image: [],
          video: [],
        },
      },
      assetGeneratorModal: null,
      assetGeneratorMode: "generate",
      assetGeneratorEditingAsset: null,
      assetGeneratorName: "闂傚倸鍊烽悞锕傚磿閹惰姤鍋夐柣鎾冲瘨閻掍粙鏌ｅΔ鈧悧婊冣枔娴犲鐓欓悗娑欘焽缁犳壆绱?(1)",
      assetGeneratorPrompt: "",
      assetGeneratorCharacterType: "human",
      assetGeneratorStyleValue: "搴熷湡鍐欏疄椋庢牸",
      assetGeneratorStyleCategory: "official",
      assetGeneratorStyleOption: "none",
      assetGeneratorMaterialCategory: "official",
      assetGeneratorMaterialOption: "fantasy-doomsday",
      assetGeneratorImageType: "main",
      assetGeneratorModel: "Seedream 2.0",
      assetGeneratorResolution: "2K",
      assetGeneratorCount: 1,
      renameImportedAsset: null,
      renameImportedAssetName: "",
      renameImportedAssetNotice: "",
      deleteImportedAsset: null,
      customEpisodes: [],
      selectedEpisodeId: null,
      episodeWorkbenchContext: null,
      episodeWorkbenchError: "",
      episodeGenerationConfig: null,
      episodeStoryboardMap: {},
      episodeMediaMode: "image",
      museBoardMode: "operation",
      museScopeMode: "storyboard",
      musePromptMenu: null,
      videoGenerationMode: "first-frame",
      imageGenerationMode: "single-image",
      isSingleEpisodeModalOpen: false,
      singleEpisodeName: "",
      singleEpisodeScript: "",
      singleEpisodeAspectRatio: "9:16",
      singleEpisodeModel: "seedance-2.0",
      singleEpisodeNotice: "",
      renameEpisodeId: null,
      renameEpisodeName: "",
      renameEpisodeNotice: "",
      deleteEpisodeId: null,
      renameProjectId: null,
      renameProjectName: "",
      renameProjectNotice: "",
      deleteProjectId: null,
      selectedProjectCardId: null,
      isScriptModalOpen: false,
      isOriginalScriptModalOpen: false,
      originalScriptDraft: {
        fileName: "",
        audience: "女性向",
        genre: "都市奇幻",
        episodeCount: "",
        cardSetting: "标准分卡",
        episodeLength: "约 1 分钟",
        inspiration: "",
      },
      scriptTab: "script-upload",
      scriptSubmitAction: "create-project",
      scriptSubmitLabel: "鍒涘缓椤圭洰",
      uploadNotice: "",
      selectedModelId: "tnb-pro",
      prompt: "",
      videoDurationSec: "5",
      videoResolution: "1080p",
      videoCount: 1,
      videoAudioEnabled: true,
      videoMusicEnabled: true,
      videoLipSyncEnabled: true,
      isVideoModelMenuOpen: false,
      openGenerationSelectMenu: null,
      isFirstFrameMenuOpen: false,
      activeGenerationFrameMenu: null,
      isGenerationConsoleCollapsed: false,
      storyboardDeleteId: null,
      storyboardImageDeleteTarget: null,
      storyboardVideoDeleteTarget: null,
      assetInspector: null,
      referenceAssetPickerKind: null,
      referenceAssetPickerMediaType: "image",
      referencePromptPreset: "comic-style",
      imageCount: 1,
      imageResolution: "2K",
      imageAspectRatio: "16:9",
      multiImageStrategy: "spatial-multi-view",
      defaultScript: DEFAULT_SCRIPT,
      storyboards: [],
      selectedStoryboardId: null,
      calibrationSkipReason: "",
      calibrationOverrideReason: "",
      lastCalibrationResult: null,
      exportHistory: [],
      imageGenerationResult: null,
      videoGenerationResult: null,
      generationPollingActive: false,
      exportPreviewResult: null,
      isStoryboardDescriptionModalOpen: false,
      storyboardDescriptionDraft: "",
      episodeCardMenuId: null,
      activeNavTab: deriveInitialNavTab(window.location.hash),
      projectPanelMode: deriveInitialProjectPanelMode(window.location.hash),
      libraryTeamRoute: deriveInitialLibraryTeamRoute(window.location.hash),
      libraryTeamAssetScope: "official",
      libraryCategory: "character",
      libraryFolder: "国内仿真人-现代都市",
      libraryQuery: "",
      libraryCategories: [],
      libraryFolders: [],
      libraryAssets: [],
      libraryEntitlement: null,
      teamAssetLocalUploads: {
        character: [],
        scene: [],
        prop: [],
        voice: [],
      },
      libraryLoading: false,
      libraryError: "",
      libraryDetailAssetId: "",
      libraryDetailView: "turnaround",
      isLibraryPricingModalOpen: false,
      isMemberRulesModalOpen: false,
    },
  };
  root.addEventListener("mousedown", (event) => {
    const eventTarget = resolveEventElement(event.target);
    const mouseSelectTarget = eventTarget?.closest?.(
      '.episode-replica-asset-card [data-action="set-episode-asset"], .episode-replica-asset-card [data-action="toggle-episode-asset-selection"]',
    );
    if (!mouseSelectTarget) {
      return;
    }
    // Preserve the current scroll position when selecting asset cards with the mouse.
    event.preventDefault();
  });
  root.addEventListener("click", (event) => {
    const eventTarget = resolveEventElement(event.target);
    const actionTarget = eventTarget?.closest?.("[data-action]");
    if (!actionTarget) {
      const cardTarget = eventTarget?.closest?.(".episode-replica-asset-card[data-asset-card-id]");
      const blockedInteractiveTarget = eventTarget?.closest?.(
        "textarea, input, button, select, option, label, a, [contenteditable='true']",
      );
      if (cardTarget && !blockedInteractiveTarget) {
        void handleProductionWorkbenchAction(workbench, {
          dataset: {
            action: "set-episode-asset",
            assetId: cardTarget.dataset.assetCardId ?? "",
            assetKind: cardTarget.dataset.assetKind ?? "",
          },
        }).catch((error) => {
          workbench.ui.toast = `操作失败：${friendlyError(error)}`;
          render(workbench);
        });
        return;
      }
    }
    if (!actionTarget) {
      if (
        workbench.ui.assetCardMenuId ||
        workbench.ui.episodeCardMenuId ||
        workbench.ui.projectCardMenuId ||
        workbench.ui.isVideoModelMenuOpen ||
        workbench.ui.openGenerationSelectMenu ||
        workbench.ui.musePromptMenu ||
        workbench.ui.isFirstFrameMenuOpen ||
        workbench.ui.referenceAssetPickerKind
      ) {
        workbench.ui.assetCardMenuId = null;
        workbench.ui.episodeCardMenuId = null;
        workbench.ui.projectCardMenuId = null;
        workbench.ui.isVideoModelMenuOpen = false;
        workbench.ui.openGenerationSelectMenu = null;
        workbench.ui.musePromptMenu = null;
        workbench.ui.isFirstFrameMenuOpen = false;
        workbench.ui.activeGenerationFrameMenu = null;
        workbench.ui.referenceAssetPickerKind = null;
        render(workbench);
      }
      return;
    }
    if (
      actionTarget.matches?.('input[data-action="upload-project-cover"]') ||
      actionTarget.matches?.(".asset-import-file-input") ||
      actionTarget.matches?.(".team-asset-local-upload-input")
    ) {
      return;
    }
    collectEpisodeWorkbenchEvent(workbench, "click", {
      action: actionTarget.dataset.action ?? "",
      dataset: datasetToObject(actionTarget.dataset),
      label: actionTarget.textContent?.trim()?.slice(0, 120) ?? "",
    });
    void handleProductionWorkbenchAction(workbench, actionTarget).catch((error) => {
      workbench.ui.toast = `操作失败：${friendlyError(error)}`;
      render(workbench);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    if (
      !workbench.ui.assetCardMenuId &&
      !workbench.ui.episodeCardMenuId &&
      !workbench.ui.projectCardMenuId &&
      !workbench.ui.isLibraryPricingModalOpen &&
      !workbench.ui.isMemberRulesModalOpen &&
      !workbench.ui.isVideoModelMenuOpen &&
      !workbench.ui.openGenerationSelectMenu &&
      !workbench.ui.musePromptMenu &&
      !workbench.ui.isFirstFrameMenuOpen &&
      !workbench.ui.activeGenerationFrameMenu &&
      !workbench.ui.referenceAssetPickerKind &&
      !workbench.ui.libraryDetailAssetId &&
      !workbench.ui.storyboardDeleteId
    ) {
      return;
    }
    workbench.ui.assetCardMenuId = null;
    workbench.ui.episodeCardMenuId = null;
    workbench.ui.projectCardMenuId = null;
    workbench.ui.isLibraryPricingModalOpen = false;
    workbench.ui.isMemberRulesModalOpen = false;
    workbench.ui.libraryDetailAssetId = "";
    workbench.ui.libraryDetailView = "turnaround";
    workbench.ui.isVideoModelMenuOpen = false;
    workbench.ui.openGenerationSelectMenu = null;
    workbench.ui.musePromptMenu = null;
    workbench.ui.isFirstFrameMenuOpen = false;
    workbench.ui.activeGenerationFrameMenu = null;
    workbench.ui.referenceAssetPickerKind = null;
    workbench.ui.storyboardDeleteId = null;
    render(workbench, { preserveLibraryScroll: true });
  });

  root.addEventListener("change", async (event) => {
    const target = resolveEventElement(event.target);

    if (target?.matches?.("[data-model-choice]")) {
      workbench.ui.selectedModelId = target.value;
      workbench.ui.toast = `Selected ${target.options[target.selectedIndex]?.text ?? target.value}.`;
      render(workbench);
      return;
    }

    if (target?.matches?.('input[name="video-model"]')) {
      workbench.ui.selectedModelId = target.value;
      workbench.ui.toast = `Selected ${target.value}.`;
      render(workbench);
      return;
    }

    if (target?.matches?.('input[name="project-aspect-ratio"]')) {
      workbench.ui.createAspectRatio = target.value;
      render(workbench);
      return;
    }

    if (target?.matches?.('input[name="project-type"]')) {
      workbench.ui.createProjectType = target.value;
      render(workbench);
      return;
    }

    if (target?.matches?.("#single-episode-model-select")) {
      workbench.ui.singleEpisodeModel = target.value;
      render(workbench);
      return;
    }

    if (target?.matches?.("#original-script-audience")) {
      workbench.ui.originalScriptDraft.audience = target.value;
      updateOriginalScriptSubmitState(workbench);
      return;
    }

    if (target?.matches?.("#original-script-genre")) {
      workbench.ui.originalScriptDraft.genre = target.value;
      updateOriginalScriptSubmitState(workbench);
      return;
    }

    if (target?.matches?.("#original-script-episode-count")) {
      workbench.ui.originalScriptDraft.episodeCount = target.value;
      updateOriginalScriptSubmitState(workbench);
      return;
    }

    if (target?.matches?.("#original-script-card-setting")) {
      workbench.ui.originalScriptDraft.cardSetting = target.value;
      updateOriginalScriptSubmitState(workbench);
      return;
    }

    if (target?.matches?.("#original-script-episode-length")) {
      workbench.ui.originalScriptDraft.episodeLength = target.value;
      updateOriginalScriptSubmitState(workbench);
      return;
    }

    if (target?.matches?.('input[name="project-status-filter"]')) {
      const next = new Set(workbench.ui.projectStatusFilters ?? []);
      if (target.checked) {
        next.add(target.value);
      } else {
        next.delete(target.value);
      }
      workbench.ui.projectStatusFilters = [...next];
      workbench.ui.projectLibraryPage = 1;
      render(workbench);
      return;
    }

    if (target?.matches?.('input[data-action="upload-project-cover"]')) {
      const [file] = [...(target.files ?? [])];
      console.log("[project-cover] input:change", {
        projectId: target.dataset.projectId ?? null,
        fileCount: target.files?.length ?? 0,
        fileName: file?.name ?? null,
      });
      if (!file) {
        return;
      }

      const projectId = target.dataset.projectId ?? null;
      target.value = "";
      workbench.ui.projectCardMenuId = null;
      await runAction(workbench, "濠电姵顔栭崰妤冩崲閹邦喖绶ら柦妯侯檧閼版寧銇勮箛鎾跺闁告濞婇幃妤€鈽夊▍铏灴閹繝鍩€椤掍椒绻嗛柣鎰典簻閳ь剚娲栭敃銏ゅ础閻忕粯妞介獮宥夘敊閼姐倕澧惧┑鐐存尰閸╁啴宕戦幘瀵哥?..", async () => {
        await uploadProjectCoverFile(workbench, file, projectId);
      });
      return;
    }

    if (target?.matches?.(".asset-import-file-input")) {
      const files = [...(target.files ?? [])];
      target.value = "";
      if (!files.length) {
        return;
      }
      await handleAssetImportFiles(workbench, files);
      return;
    }

    if (target?.matches?.(".team-asset-local-upload-input")) {
      const files = [...(target.files ?? [])];
      const category = target.dataset.libraryCategory ?? workbench.ui.libraryCategory ?? "character";
      target.value = "";
      if (!files.length) {
        return;
      }
      await handleTeamAssetLocalUploadFiles(workbench, category, files);
      return;
    }

    if (target?.matches?.(".local-video-upload-input")) {
      const files = [...(target.files ?? [])];
      const storyboardId = target.dataset.storyboardId ?? workbench.ui.selectedStoryboardId ?? null;
      target.value = "";
      if (!files.length || !storyboardId) {
        return;
      }
      await handleLocalStoryboardVideoFiles(workbench, storyboardId, files);
      return;
    }

    if (target?.matches?.(".local-storyboard-image-input")) {
      const [file] = [...(target.files ?? [])];
      const storyboardId = target.dataset.storyboardId ?? workbench.ui.selectedStoryboardId ?? null;
      target.value = "";
      if (!file || !storyboardId) {
        return;
      }
      await handleLocalStoryboardImageFile(workbench, storyboardId, file);
      return;
    }

    if (target?.matches?.(".generation-upload-input")) {
      const files = [...(target.files ?? [])];
      const uploadTarget = target.dataset.uploadTarget ?? "";
      target.value = "";
      if (!files.length || !uploadTarget) {
        return;
      }
      await handleGenerationUploadFiles(workbench, uploadTarget, files);
      return;
    }

    if (target?.matches?.(".episode-workbench-attachment-input")) {
      const files = [...(target.files ?? [])];
      const attachmentType = target.dataset.attachmentType ?? "image";
      target.value = "";
      if (!files.length) {
        return;
      }
      handleEpisodeWorkbenchAttachmentFiles(workbench, attachmentType, files);
      return;
    }

    if (target?.matches?.("[data-generation-field]")) {
      applyGenerationFieldChange(workbench, target.dataset.generationField ?? "", target.value);
      render(workbench);
      return;
    }

    if (target?.matches?.('[data-generation-toggle="sound-sync"]')) {
      const checked = Boolean(target.checked);
      workbench.ui.videoAudioEnabled = checked;
      workbench.ui.videoMusicEnabled = checked;
      workbench.ui.videoLipSyncEnabled = checked;
      render(workbench);
    }
  });

  root.addEventListener("dragover", (event) => {
    const eventTarget = resolveEventElement(event.target);
    const zone = eventTarget?.closest?.('[data-dropzone="asset-import"], [data-dropzone="storyboard-image"]');
    if (!zone) {
      return;
    }
    event.preventDefault();
    zone.classList.add("is-dragging");
  });

  root.addEventListener("dragleave", (event) => {
    const eventTarget = resolveEventElement(event.target);
    const zone = eventTarget?.closest?.('[data-dropzone="asset-import"], [data-dropzone="storyboard-image"]');
    if (!zone) {
      return;
    }
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && zone.contains(nextTarget)) {
      return;
    }
    zone.classList.remove("is-dragging");
  });

  root.addEventListener("drop", async (event) => {
    const eventTarget = resolveEventElement(event.target);
    const zone = eventTarget?.closest?.('[data-dropzone="asset-import"], [data-dropzone="storyboard-image"]');
    if (!zone) {
      return;
    }
    event.preventDefault();
    zone.classList.remove("is-dragging");
    const files = [...(event.dataTransfer?.files ?? [])];
    if (!files.length) {
      return;
    }
    if (zone.dataset.dropzone === "storyboard-image") {
      const storyboardId = zone.dataset.storyboardId ?? workbench.ui.selectedStoryboardId ?? null;
      const [file] = files;
      if (!file || !storyboardId) {
        return;
      }
      await handleLocalStoryboardImageFile(workbench, storyboardId, file);
      return;
    }
    await handleAssetImportFiles(workbench, files);
  });

  root.addEventListener("compositionstart", (event) => {
    const target = resolveEventElement(event.target);
    if (target?.matches?.("[data-library-search-input]")) {
      workbench.librarySearchComposing = true;
    }
  });

  root.addEventListener("compositionend", (event) => {
    const target = resolveEventElement(event.target);
    if (!target?.matches?.("[data-library-search-input]")) {
      return;
    }
    workbench.librarySearchComposing = false;
    workbench.ui.libraryQuery = target.value;
    workbench.ui.libraryDetailAssetId = "";
    workbench.ui.libraryDetailView = "turnaround";
    scheduleAssetLibrarySearch(workbench);
  });

  root.addEventListener("input", (event) => {
    const target = resolveEventElement(event.target);

    if (target?.matches?.("#video-prompt-input")) {
      workbench.ui.prompt = target.value;
      collectEpisodeWorkbenchEvent(workbench, "prompt.input", {
        value: target.value,
        length: [...target.value].length,
        mediaMode: workbench.ui.episodeMediaMode ?? "image",
        selectedStoryboardId: workbench.ui.selectedStoryboardId ?? null,
      });
      return;
    }

    if (target?.matches?.('.episode-replica-right-search input')) {
      workbench.ui.assetSearchQuery = target.value;
      render(workbench);
      return;
    }

    if (target?.matches?.("#script-input")) {
      workbench.ui.defaultScript = target.value;
      return;
    }

    if (target?.matches?.("#original-script-file-name")) {
      workbench.ui.originalScriptDraft.fileName = target.value;
      const counter = target.closest(".control-field")?.querySelector("small");
      if (counter) {
        counter.textContent = `${[...target.value].length}/50`;
      }
      updateOriginalScriptSubmitState(workbench);
      return;
    }

    if (target?.matches?.("#original-script-inspiration")) {
      workbench.ui.originalScriptDraft.inspiration = target.value;
      const counter = target.closest(".control-field")?.querySelector("small");
      if (counter) {
        counter.textContent = `${[...target.value].length}/460`;
      }
      updateOriginalScriptSubmitState(workbench);
      return;
    }

    if (target?.matches?.("#calibration-skip-reason-input")) {
      workbench.ui.calibrationSkipReason = target.value;
      return;
    }

    if (target?.matches?.("#calibration-override-reason-input")) {
      workbench.ui.calibrationOverrideReason = target.value;
      return;
    }

    if (target?.matches?.("#project-create-name-input")) {
      workbench.ui.createProjectName = target.value;
      return;
    }

    if (target?.matches?.("[data-library-search-input]")) {
      workbench.ui.libraryQuery = target.value;
      workbench.ui.libraryDetailAssetId = "";
      workbench.ui.libraryDetailView = "turnaround";
      if (event.isComposing || workbench.librarySearchComposing) {
        return;
      }
      scheduleAssetLibrarySearch(workbench);
      return;
    }

    if (target?.matches?.("#project-rename-name-input")) {
      workbench.ui.renameProjectName = target.value;
      if (workbench.ui.renameProjectNotice) {
        workbench.ui.renameProjectNotice = "";
      }
      const counter = workbench.root.querySelector(".rename-project-count");
      if (counter) {
        counter.textContent = `${[...target.value].length}/50`;
      }
      const notice = workbench.root.querySelector(".rename-project-actions .modal-inline-status");
      if (notice) {
        notice.textContent = "";
      }
      return;
    }

    if (target?.matches?.("#single-episode-script-input")) {
      workbench.ui.singleEpisodeScript = target.value;
      if (workbench.ui.singleEpisodeNotice) {
        workbench.ui.singleEpisodeNotice = "";
      }
      const counter = workbench.root.querySelector(".single-episode-count");
      if (counter) {
        counter.textContent = `${[...target.value].length}/5000`;
      }
      const notice = workbench.root.querySelector(".single-episode-status-row .modal-inline-status");
      if (notice) {
        notice.textContent = "";
      }
      return;
    }

    if (target?.matches?.("#episode-rename-name-input")) {
      workbench.ui.renameEpisodeName = target.value;
      if (workbench.ui.renameEpisodeNotice) {
        workbench.ui.renameEpisodeNotice = "";
      }
      const counter = workbench.root.querySelector(".asset-rename-modal .asset-rename-count");
      if (counter) {
        counter.textContent = `${[...target.value].length}/50`;
      }
      const notice = workbench.root.querySelector(".asset-rename-modal .modal-inline-status");
      if (notice) {
        notice.textContent = "";
      }
      return;
    }

    if (target?.matches?.(".asset-import-name-input")) {
      const draftId = target.dataset.draftId ?? null;
      workbench.ui.assetImportDrafts = (workbench.ui.assetImportDrafts ?? []).map((draft) =>
        draft.id === draftId
          ? {
              ...draft,
              name: target.value,
            }
          : draft,
      );
      return;
    }

    if (target?.matches?.("#asset-search-input")) {
      workbench.ui.assetSearchQuery = target.value;
      render(workbench);
      return;
    }

    if (target?.matches?.("#asset-only-main-input")) {
      workbench.ui.assetOnlyMain = Boolean(target.checked);
      render(workbench);
      return;
    }

    if (target?.matches?.("#asset-generator-name-input")) {
      workbench.ui.assetGeneratorName = target.value;
      const counter = workbench.root.querySelector(".asset-generator-name-count");
      if (counter) {
        counter.textContent = `${[...target.value].length}/50`;
      }
      return;
    }

    if (target?.matches?.("#asset-generator-prompt-input")) {
      workbench.ui.assetGeneratorPrompt = target.value;
      const counter = workbench.root.querySelector(".asset-generator-prompt-count");
      if (counter) {
        counter.textContent = `${[...target.value].length}/460`;
      }
      return;
    }

    if (target?.matches?.("#asset-rename-name-input")) {
      workbench.ui.renameImportedAssetName = target.value;
      workbench.ui.renameImportedAssetNotice = "";
      const counter = workbench.root.querySelector(".rename-project-count.asset-rename-count");
      if (counter) {
        counter.textContent = `${[...target.value].length}/50`;
      }
      return;
    }

    if (target?.matches?.("#storyboard-description-input")) {
      workbench.ui.storyboardDescriptionDraft = target.value;
      return;
    }

    if (target?.matches?.("#episode-asset-create-name")) {
      workbench.ui.episodeAssetCreateModal = {
        ...(workbench.ui.episodeAssetCreateModal ?? { show: true, type: "character", name: "" }),
        name: target.value,
      };
      const counter = workbench.root.querySelector(".episode-asset-create-input-wrap em");
      if (counter) {
        counter.textContent = `${[...target.value].length} / 20`;
      }
      const saveButton = workbench.root.querySelector(".episode-asset-create-save");
      if (saveButton) {
        saveButton.toggleAttribute("disabled", !(target.value ?? "").trim());
      }
      return;
    }

    if (target?.matches?.(".episode-replica-asset-desc-input")) {
      const counter = target.closest(".episode-replica-asset-card")?.querySelector(".count");
      if (counter) {
        counter.textContent = `${[...target.value].length} / 800`;
      }
      collectEpisodeWorkbenchEvent(workbench, "asset-description.input", {
        assetId: target.dataset.assetId ?? "",
        assetKind: target.dataset.assetKind ?? "character",
        value: target.value,
        length: [...target.value].length,
      });
      return;
    }

    if (target?.matches?.('[data-action="search-projects"]')) {
      workbench.ui.projectSearchQuery = target.value;
      workbench.ui.projectLibraryPage = 1;
      render(workbench);
    }
  });

  root.addEventListener("focusout", async (event) => {
    const target = resolveEventElement(event.target);
    if (!target?.matches?.(".episode-replica-asset-desc-input")) {
      return;
    }
    const assetId = target.dataset.assetId ?? "";
    const assetKind = target.dataset.assetKind ?? "character";
    await saveEpisodeAssetDescription(workbench, assetKind, assetId, target.value);
  });

  await refresh(workbench);
  render(workbench);
}

async function refresh(workbench) {
  workbench.state = await workbench.api.getCreatorState();
  if (workbench.state?.project?.id) {
    try {
      applyProjectDetail(workbench, await loadProjectDetailForWorkbench(workbench, workbench.state.project.id));
      await syncProjectInteriorSupplementary(workbench);
    } catch (error) {
      if (!String(error instanceof Error ? error.message : error).includes("project_not_found")) {
        throw error;
      }
    }
  }
  await syncProjectLibraryFromApi(workbench);
  await syncAssetLibraryFromApi(workbench);
  workbench.ui.exportHistory = workbench.state.project
    ? await loadExportHistory(workbench)
    : [];
  hydratePersistedWorkbenchState(workbench);
  const nextStoryboards = syncStoryboards(
    workbench.ui.storyboards,
    createStoryboardList(workbench.state),
  );
  workbench.ui.storyboards = nextStoryboards;
  workbench.ui.episodeStoryboardMap = syncEpisodeStoryboardMap(
    workbench.ui.episodeStoryboardMap,
    nextStoryboards,
    workbench.ui.customEpisodes,
  );
  if (
    workbench.ui.projectPanelMode === "episode-workbench" &&
    workbench.ui.selectedEpisodeId &&
    workbench.ui.selectedEpisodeId !== "episode-primary"
  ) {
    try {
      const episodeStoryboards = await loadEpisodeStoryboardsForWorkbench(
        workbench,
        workbench.ui.selectedEpisodeId,
      );
      workbench.ui.episodeStoryboardMap = {
        ...workbench.ui.episodeStoryboardMap,
        [workbench.ui.selectedEpisodeId]: episodeStoryboards,
      };
    } catch (error) {
      workbench.ui.episodeWorkbenchError = friendlyError(error);
    }
  }
  syncWorkbenchRouteState(workbench, window.location.hash);
  if (!(await restoreEpisodeRouteState(workbench, window.location))) {
    await restoreProjectRouteState(workbench, window.location);
  }
  syncSelectedStoryboardId(workbench, getActiveStoryboards(workbench, nextStoryboards));
}

async function loadProjectDetailForWorkbench(workbench, projectId) {
  if (typeof workbench.api.getProjectDetailV2 === "function") {
    try {
      return normalizeProjectDetailContract(await workbench.api.getProjectDetailV2(projectId));
    } catch (error) {
      if (typeof workbench.api.getProjectDetail !== "function" || !shouldFallbackToLegacyProjectDetail(error)) {
        throw error;
      }
    }
  }
  return normalizeProjectDetailContract(await workbench.api.getProjectDetail(projectId));
}

function shouldFallbackToLegacyProjectDetail(error) {
  const message = String(error instanceof Error ? error.message : error);
  const status = Number(error?.status ?? 0);
  const errorCode = String(error?.errorCode ?? "");
  return (
    status === 404 ||
    errorCode === "resource_not_found" ||
    message.includes("ENOENT") ||
    message.includes("no such file or directory")
  );
}

async function loadExportHistory(workbench) {
  try {
    const payload = await workbench.api.getExportHistory();
    return Array.isArray(payload.records) ? payload.records : [];
  } catch (error) {
    if (String(error instanceof Error ? error.message : error).includes("creator_project_missing")) {
      return [];
    }
    throw error;
  }
}

async function syncProjectInteriorSupplementary(workbench) {
  const projectId = workbench.ui.selectedProjectCardId ?? workbench.state?.project?.id ?? null;
  if (!projectId) {
    workbench.ui.projectMembers = [];
    workbench.ui.projectStats = null;
    return;
  }

  try {
    const [membersPayload, statsPayload] = await Promise.all([
      workbench.api.getProjectMembers(projectId),
      workbench.api.getProjectStats(projectId),
    ]);
    workbench.ui.projectMembers = Array.isArray(membersPayload.members) ? membersPayload.members : [];
    workbench.ui.projectStats = statsPayload.stats ?? null;
  } catch (error) {
    workbench.ui.projectMembers = [];
    workbench.ui.projectStats = null;
  }
}

function render(workbench, options = {}) {
  const libraryScrollState = options.preserveLibraryScroll
    ? captureLibraryScrollState(workbench.root)
    : null;
  const activeStoryboards = getActiveStoryboards(workbench);
  const selectedStoryboard = getSelectedStoryboard(
    activeStoryboards,
    workbench.ui.selectedStoryboardId,
  );
  workbench.root.innerHTML = renderProductionWorkbench({
    state: workbench.state,
    session: workbench.session,
    api: workbench.api,
    ui: {
      ...workbench.ui,
      storyboards: activeStoryboards,
      selectedStoryboard,
    },
  });
  restoreLibraryScrollState(workbench.root, libraryScrollState);
  if (options.focusLibrarySearch) {
    restoreLibrarySearchFocus(workbench.root);
  }
  persistWorkbenchState(workbench);
  applyPostRenderEffects(workbench);
}

function captureLibraryScrollState(root) {
  const libraryScroll = root.querySelector(".library-workspace-scroll");
  const pageScroll = document.scrollingElement ?? document.documentElement;
  return {
    libraryLeft: libraryScroll?.scrollLeft ?? 0,
    libraryTop: libraryScroll?.scrollTop ?? 0,
    pageLeft: pageScroll?.scrollLeft ?? window.scrollX ?? 0,
    pageTop: pageScroll?.scrollTop ?? window.scrollY ?? 0,
  };
}

function restoreLibraryScrollState(root, scrollState) {
  if (!scrollState) {
    return;
  }

  const applyScroll = () => {
    const libraryScroll = root.querySelector(".library-workspace-scroll");
    if (libraryScroll) {
      libraryScroll.scrollLeft = scrollState.libraryLeft;
      libraryScroll.scrollTop = scrollState.libraryTop;
    }
    const pageScroll = document.scrollingElement ?? document.documentElement;
    if (pageScroll) {
      pageScroll.scrollLeft = scrollState.pageLeft;
      pageScroll.scrollTop = scrollState.pageTop;
    }
  };

  applyScroll();
  window.requestAnimationFrame?.(applyScroll);
}

function scheduleAssetLibrarySearch(workbench) {
  if (workbench.librarySearchTimer) {
    clearTimeout(workbench.librarySearchTimer);
  }

  const requestId = (workbench.librarySearchRequestId ?? 0) + 1;
  workbench.librarySearchRequestId = requestId;
  workbench.librarySearchTimer = setTimeout(async () => {
    workbench.librarySearchTimer = null;
    await syncAssetLibraryFromApi(workbench, { requestId });
    if (workbench.librarySearchRequestId === requestId) {
      render(workbench, { focusLibrarySearch: true });
    }
  }, 250);
}

function cancelAssetLibrarySearch(workbench) {
  if (workbench.librarySearchTimer) {
    clearTimeout(workbench.librarySearchTimer);
    workbench.librarySearchTimer = null;
  }
  workbench.librarySearchRequestId = (workbench.librarySearchRequestId ?? 0) + 1;
}

function restoreLibrarySearchFocus(root) {
  const input = root.querySelector("[data-library-search-input]");
  if (!input) {
    return;
  }
  input.focus({ preventScroll: true });
  const position = input.value.length;
  input.setSelectionRange?.(position, position);
}

function mergeGenerationState(currentState, nextState) {
  const current = currentState ?? createEmptyGenerationState();
  const next = nextState ?? createEmptyGenerationState();
  return {
    ...createEmptyGenerationState(),
    ...next,
    ...current,
    referenceUploads:
      (current.referenceUploads?.length ? current.referenceUploads : next.referenceUploads) ?? [],
    localReferenceRoles:
      (current.localReferenceRoles?.length ? current.localReferenceRoles : next.localReferenceRoles) ?? [],
    referenceSelections:
      (current.referenceSelections?.length ? current.referenceSelections : next.referenceSelections) ?? [],
  };
}

export async function handleProductionWorkbenchAction(workbench, target) {
  const action = target.dataset.action;
  const allowWhileBusy = new Set([
    "open-delete-sidebar-storyboard-modal",
    "close-delete-storyboard-modal",
    "confirm-delete-storyboard",
    "delete-storyboard-video",
    "close-delete-storyboard-video-modal",
    "confirm-delete-storyboard-video",
    "delete-storyboard-image",
    "close-delete-storyboard-image-modal",
    "confirm-delete-storyboard-image",
    "close-asset-inspector",
  ]);
  if (!action || (workbench.ui.busy && !allowWhileBusy.has(action))) {
    return;
  }

  if (action === "logout") {
    workbench.ui.busy = true;
    workbench.ui.toast = "濠电姵顔栭崰妤冩崲閹邦喖绶ら柦妯侯檧閼版寧銇勮箛鎾跺闁绘帒顭烽弻宥堫檨闁告挾鍠庨悾宄扳枎閹惧瓨鍎柣鐔哥懃鐎氶攱绂掗鈧幃?..";
    render(workbench);
    try {
      await workbench.onLogout?.();
    } catch (error) {
      workbench.ui.busy = false;
      workbench.ui.toast = `退出失败：${friendlyError(error)}`;
      render(workbench);
    }
    return;
  }

  if (action === "open-pricing") {
    workbench.ui.isLibraryPricingModalOpen = true;
    render(workbench);
    return;
  }

  if (action === "close-pricing") {
    workbench.ui.isLibraryPricingModalOpen = false;
    render(workbench);
    return;
  }

  if (action === "show-commerce-placeholder") {
    workbench.ui.toast = "商务合作入口暂未接入当前演示环境。";
    render(workbench);
    return;
  }

  if (action === "show-library-placeholder") {
    workbench.ui.toast =
      target.dataset.placeholderMessage ?? "该资产库能力暂未开放。"
    render(workbench);
    return;
  }

  if (action === "set-library-asset-scope") {
    cancelAssetLibrarySearch(workbench);
    workbench.ui.activeNavTab = "library";
    workbench.ui.libraryTeamAssetScope = target.dataset.assetScope ?? "official";
    if (
      workbench.ui.libraryTeamAssetScope === "official" &&
      !isApiBackedLibraryCategory(workbench.ui.libraryCategory)
    ) {
      workbench.ui.libraryCategory = "character";
    }
    workbench.ui.libraryFolder = workbench.ui.libraryFolder || "国内仿真人-现代都市";
    workbench.ui.libraryQuery = "";
    workbench.ui.libraryLoading = shouldFetchAssetLibrary(workbench);
    workbench.ui.isLibraryPricingModalOpen = false;
    workbench.ui.libraryDetailAssetId = "";
    workbench.ui.libraryDetailView = "turnaround";
    workbench.ui.toast = `已切换到${libraryAssetScopeLabel(workbench.ui.libraryTeamAssetScope)}资产库。`;
    window.location.hash = "library";
    render(workbench);
    await syncAssetLibraryFromApi(workbench);
    render(workbench);
    return;
  }

  if (action === "set-library-category") {
    cancelAssetLibrarySearch(workbench);
    workbench.ui.activeNavTab = "library";
    workbench.ui.libraryCategory = target.dataset.libraryCategory ?? "character";
    workbench.ui.libraryFolder = "";
    workbench.ui.libraryQuery = "";
    workbench.ui.libraryLoading = shouldFetchAssetLibrary(workbench);
    workbench.ui.libraryDetailAssetId = "";
    workbench.ui.libraryDetailView = "turnaround";
    render(workbench);
    await syncAssetLibraryFromApi(workbench);
    render(workbench);
    return;
  }

  if (action === "set-library-folder") {
    cancelAssetLibrarySearch(workbench);
    workbench.ui.activeNavTab = "library";
    workbench.ui.libraryFolder = target.dataset.libraryFolder ?? "";
    workbench.ui.libraryQuery = "";
    workbench.ui.libraryLoading = true;
    workbench.ui.libraryDetailAssetId = "";
    workbench.ui.libraryDetailView = "turnaround";
    render(workbench);
    await syncAssetLibraryFromApi(workbench);
    render(workbench);
    return;
  }

  if (action === "clear-library-search") {
    cancelAssetLibrarySearch(workbench);
    workbench.ui.activeNavTab = "library";
    workbench.ui.libraryQuery = "";
    workbench.ui.libraryLoading = shouldFetchAssetLibrary(workbench);
    workbench.ui.libraryDetailAssetId = "";
    workbench.ui.libraryDetailView = "turnaround";
    render(workbench);
    await syncAssetLibraryFromApi(workbench);
    render(workbench);
    return;
  }

  if (action === "open-library-asset-detail") {
    workbench.ui.activeNavTab = "library";
    workbench.ui.libraryDetailAssetId = target.dataset.libraryAssetId ?? "";
    workbench.ui.libraryDetailView =
      target.dataset.detailView ?? target.dataset.libraryDetailView ?? "turnaround";
    render(workbench, { preserveLibraryScroll: true });
    return;
  }

  if (action === "close-library-asset-detail") {
    workbench.ui.libraryDetailAssetId = "";
    workbench.ui.libraryDetailView = "turnaround";
    render(workbench, { preserveLibraryScroll: true });
    return;
  }

  if (action === "select-library-asset-detail-view") {
    workbench.ui.libraryDetailView =
      target.dataset.detailView ?? target.dataset.libraryDetailView ?? "turnaround";
    render(workbench, { preserveLibraryScroll: true });
    return;
  }

  if (action === "pick-team-asset-local-upload") {
    resolveTeamAssetLocalUploadInput(target)?.click?.();
    return;
  }

  if (action === "delete-team-asset-local-upload") {
    const category = target.dataset.libraryCategory ?? workbench.ui.libraryCategory ?? "character";
    const uploadId = target.dataset.localUploadId ?? "";
    const removed = removeTeamAssetLocalUpload(workbench.ui, category, uploadId);
    workbench.ui.toast = removed ? "已删除本地上传预览。" : "未找到要删除的本地上传。";
    render(workbench, { preserveLibraryScroll: true });
    return;
  }

  if (action === "refresh-team") {
    workbench.ui.toast = "团队数据刷新能力暂未开放。";
    render(workbench);
    return;
  }

  if (action === "open-member-rules") {
    workbench.ui.isMemberRulesModalOpen = true;
    render(workbench);
    return;
  }

  if (action === "close-member-rules") {
    workbench.ui.isMemberRulesModalOpen = false;
    render(workbench);
    return;
  }

  if (action === "open-team-dashboard") {
    workbench.ui.activeNavTab = "team";
    workbench.ui.libraryTeamRoute = "team-dashboard";
    workbench.ui.isLibraryPricingModalOpen = false;
    workbench.ui.isMemberRulesModalOpen = false;
    workbench.ui.toast = "已进入团队概览。";
    window.location.hash = "team-dashboard";
    render(workbench);
    return;
  }

  if (action === "back-to-team-page") {
    workbench.ui.activeNavTab = "team";
    workbench.ui.libraryTeamRoute = "team";
    workbench.ui.toast = "已返回团队页面。";
    window.location.hash = "team";
    render(workbench);
    return;
  }

  if (action === "set-nav-tab") {
    workbench.ui.activeNavTab = target.dataset.tab ?? "home";
    workbench.ui.projectPanelMode =
      workbench.ui.activeNavTab === "project" ? "library" : workbench.ui.projectPanelMode;
    if (workbench.ui.activeNavTab === "team") {
      workbench.ui.libraryTeamRoute = "team";
    }
    if (workbench.ui.activeNavTab === "library") {
      workbench.ui.libraryTeamRoute = "assets";
      workbench.ui.libraryLoading = shouldFetchAssetLibrary(workbench);
    }
    workbench.ui.projectInteriorStatusMenuOpen = false;
    workbench.ui.toast = `已切换到${navTabLabel(workbench.ui.activeNavTab)}。`;
    window.location.hash = workbench.ui.activeNavTab === "home" ? "home" : workbench.ui.activeNavTab;
    if (workbench.ui.activeNavTab === "project") {
      await syncProjectLibraryFromApi(workbench);
    }
    if (workbench.ui.activeNavTab === "library") {
      await syncAssetLibraryFromApi(workbench);
    }
    render(workbench);
    return;
  }

  if (action === "open-create-modal") {
    workbench.ui.isCreateModalOpen = true;
    workbench.ui.createProjectNotice = "";
    workbench.ui.createProjectName = "";
    workbench.ui.createAspectRatio = "9:16";
    workbench.ui.createProjectType = "anime";
    render(workbench);
    return;
  }

  if (action === "close-create-modal") {
    workbench.ui.isCreateModalOpen = false;
    workbench.ui.createProjectNotice = "";
    render(workbench);
    return;
  }

  if (action === "open-script-modal") {
    workbench.ui.isScriptModalOpen = true;
    workbench.ui.scriptTab = "script-upload";
    workbench.ui.scriptSubmitAction = "create-project";
    workbench.ui.scriptSubmitLabel = "创建项目";
    workbench.ui.uploadNotice = "";
    render(workbench);
    return;
  }

  if (action === "open-original-script-modal") {
    workbench.ui.isOriginalScriptModalOpen = true;
    workbench.ui.toast = "已打开 AI 原创剧本设定。";
    render(workbench);
    return;
  }

  if (action === "close-original-script-modal") {
    workbench.ui.isOriginalScriptModalOpen = false;
    render(workbench);
    return;
  }

  if (action === "submit-original-script-settings") {
    const draft = workbench.ui.originalScriptDraft;
    if (!(draft.fileName?.trim() && draft.inspiration?.trim() && draft.episodeCount)) {
      workbench.ui.toast = "请先补全文件名称、创作灵感和拆分集数。";
      render(workbench);
      return;
    }

    workbench.ui.isOriginalScriptModalOpen = false;
    workbench.ui.toast = "设定已保存，规划方案生成入口待接入。";
    render(workbench);
    return;
  }

  if (action === "close-script-modal") {
    workbench.ui.isScriptModalOpen = false;
    workbench.ui.scriptSubmitAction = "create-project";
    workbench.ui.scriptSubmitLabel = "创建项目";
    workbench.ui.uploadNotice = "";
    render(workbench);
    return;
  }

  if (action === "switch-script-tab") {
    workbench.ui.scriptTab = target.dataset.tab ?? "script-upload";
    workbench.ui.uploadNotice = "";
    render(workbench);
    return;
  }

  if (action === "confirm-batch-episode") {
    workbench.ui.uploadNotice = "批量创建分集能力暂未开放，请先按单集流程继续。";
    workbench.ui.toast = "批量创建分集暂未开放。";
    render(workbench);
    return;
  }

  if (action === "select-storyboard") {
    workbench.ui.selectedStoryboardId = target.dataset.storyboardId ?? null;
    workbench.ui.isStoryboardDescriptionModalOpen = false;
    render(workbench);
    return;
  }

  if (action === "set-episode-asset") {
    const assetId = target.dataset.assetId ?? null;
    const assetKind = target.dataset.assetKind ?? null;
    if (assetKind) {
      workbench.ui.projectAssetTab = assetKind;
    }
    workbench.ui.selectedEpisodeCardId = assetId;
    workbench.ui.selectedEpisodeAssetId = assetId;
    render(workbench);
    return;
  }

  if (action === "toggle-episode-asset-selection") {
    const assetId = target.dataset.assetId ?? "";
    const assetKind = target.dataset.assetKind ?? null;
    if (assetKind) {
      workbench.ui.projectAssetTab = assetKind;
    }
    const current = new Set(workbench.ui.selectedEpisodeAssetIds ?? []);
    if (current.has(assetId)) {
      current.delete(assetId);
    } else if (assetId) {
      current.add(assetId);
    }
    workbench.ui.selectedEpisodeAssetIds = [...current];
    render(workbench);
    return;
  }

  if (action === "toggle-episode-asset-select-all") {
    const assetBuckets = workbench.ui.importedAssets ?? {};
    const allIds = [
      ...(assetBuckets.character ?? []).map((item) => item.id),
      ...(assetBuckets.scene ?? []).map((item) => item.id),
      ...(assetBuckets.prop ?? []).map((item) => item.id),
    ];
    const nextIds = allIds.length ? allIds : EPISODE_WORKBENCH_FALLBACK_ASSET_IDS;
    const isAllSelected =
      nextIds.length > 0 &&
      nextIds.every((id) => (workbench.ui.selectedEpisodeAssetIds ?? []).includes(id));
    workbench.ui.selectedEpisodeAssetIds = isAllSelected ? [] : [...nextIds];
    render(workbench);
    return;
  }

  if (action === "open-episode-voice-modal") {
    const assetId = target.dataset.assetId ?? "";
    const assetName = target.dataset.assetName ?? "鐟欐帟澹婇柊宥夌叾";
    workbench.ui.episodeVoiceModal = {
      assetId,
      assetName,
      assetKind: target.dataset.assetKind ?? "character",
      voiceName:
        findImportedAsset(workbench.ui.importedAssets, "character", "image", assetId)?.voiceName ?? "",
      tab: "custom",
    };
    render(workbench);
    return;
  }

  if (action === "set-episode-voice-tab") {
    workbench.ui.episodeVoiceModal = {
      ...(workbench.ui.episodeVoiceModal ?? {}),
      tab: target.dataset.tab ?? "custom",
    };
    render(workbench);
    return;
  }

  if (action === "select-episode-voice") {
    const modal = workbench.ui.episodeVoiceModal;
    const voiceName = target.dataset.voiceName ?? "";
    if (!modal?.assetId || !voiceName) {
      return;
    }
    const nextAssets = cloneImportedAssets(workbench.ui.importedAssets);
    nextAssets.character = (nextAssets.character ?? []).map((item) =>
      item.id === modal.assetId ? { ...item, voiceName } : item,
    );
    workbench.ui.importedAssets = nextAssets;
    workbench.ui.episodeVoiceModal = null;
    workbench.ui.toast = `?? ${modal.assetName ?? "??"} ?????${voiceName}`;
    render(workbench);
    return;
  }

  if (action === "close-episode-voice-modal") {
    workbench.ui.episodeVoiceModal = null;
    render(workbench);
    return;
  }

  if (action === "open-episode-asset-create-modal") {
    workbench.ui.episodeAssetCreateModal = {
      show: true,
      type: workbench.ui.projectAssetTab ?? "character",
      name: "",
    };
    render(workbench);
    return;
  }

  if (action === "close-episode-asset-create-modal") {
    workbench.ui.episodeAssetCreateModal = null;
    render(workbench);
    return;
  }

  if (action === "set-episode-asset-create-type") {
    workbench.ui.episodeAssetCreateModal = {
      ...(workbench.ui.episodeAssetCreateModal ?? { show: true, type: "character", name: "" }),
      type: target.dataset.type ?? "character",
    };
    render(workbench);
    return;
  }

  if (action === "save-episode-asset-create") {
    const modal = workbench.ui.episodeAssetCreateModal;
    const nextType = String(modal?.type ?? "").trim();
    const nextName = String(modal?.name ?? "").trim();
    if (!nextType || !nextName) {
      return;
    }
    const nextEntry = {
      id: `manual-${nextType}-${Date.now().toString(36)}`,
      name: nextName,
      preview: "",
      description: "",
      kind: nextType,
      source: "manual",
    };
    if (nextType === "other") {
      const currentOther = workbench.ui.importedAssets?.other ?? { image: [], video: [] };
      workbench.ui.importedAssets = {
        ...(workbench.ui.importedAssets ?? {}),
        other: {
          ...currentOther,
          image: [...(currentOther.image ?? []), nextEntry],
        },
      };
    } else {
      workbench.ui.importedAssets = {
        ...(workbench.ui.importedAssets ?? {}),
        [nextType]: [...(workbench.ui.importedAssets?.[nextType] ?? []), nextEntry],
      };
    }
    workbench.ui.projectAssetTab = nextType;
    workbench.ui.selectedEpisodeAssetId = nextEntry.id;
    workbench.ui.episodeWorkbenchScrollTarget = nextType;
    workbench.ui.episodeAssetCreateModal = null;
    workbench.ui.toast = `??? ${nextName}?`;
    render(workbench);
    return;
  }

  if (action === "open-delete-sidebar-storyboard-modal") {
    workbench.ui.storyboardDeleteId = target.dataset.storyboardId ?? null;
    render(workbench);
    return;
  }

  if (action === "close-delete-storyboard-modal") {
    workbench.ui.storyboardDeleteId = null;
    render(workbench);
    return;
  }

  if (action === "close-delete-storyboard-image-modal") {
    workbench.ui.storyboardImageDeleteTarget = null;
    render(workbench);
    return;
  }

  if (action === "close-delete-storyboard-video-modal") {
    workbench.ui.storyboardVideoDeleteTarget = null;
    render(workbench);
    return;
  }

  if (action === "close-asset-inspector") {
    workbench.ui.assetInspector = null;
    render(workbench);
    return;
  }

  if (action === "confirm-delete-storyboard") {
    const storyboardId = workbench.ui.storyboardDeleteId ?? "";
    workbench.ui.storyboardDeleteId = null;
    await deleteStoryboardCard(workbench, storyboardId);
    return;
  }

  if (action === "confirm-delete-storyboard-image") {
    const targetToDelete = workbench.ui.storyboardImageDeleteTarget;
    workbench.ui.storyboardImageDeleteTarget = null;
    await deleteStoryboardImage(
      workbench,
      targetToDelete?.storyboardId ?? "",
      targetToDelete?.imageId ?? "",
    );
    return;
  }

  if (action === "confirm-delete-storyboard-video") {
    const targetToDelete = workbench.ui.storyboardVideoDeleteTarget;
    workbench.ui.storyboardVideoDeleteTarget = null;
    const storyboard = getActiveStoryboards(workbench).find(
      (item) => item.id === targetToDelete?.storyboardId,
    );
    if (isStoryboardVideoProtected(storyboard, targetToDelete?.videoId ?? "")) {
      workbench.ui.toast = "??????????????????";
      render(workbench);
      return;
    }
    await deleteStoryboardVideoStable(
      workbench,
      targetToDelete?.storyboardId ?? "",
      targetToDelete?.videoId ?? "",
    );
    return;
  }

  if (action === "delete-sidebar-storyboard") {
    await deleteStoryboardCard(workbench, target.dataset.storyboardId ?? "");
    return;
  }

  if (action === "open-storyboard-description-modal") {
    const selectedStoryboard = getSelectedStoryboard(
      getActiveStoryboards(workbench),
      workbench.ui.selectedStoryboardId,
    );
    workbench.ui.isStoryboardDescriptionModalOpen = true;
    workbench.ui.storyboardDescriptionDraft = selectedStoryboard?.description ?? "";
    render(workbench);
    return;
  }

  if (action === "close-storyboard-description-modal") {
    workbench.ui.isStoryboardDescriptionModalOpen = false;
    workbench.ui.storyboardDescriptionDraft = "";
    render(workbench);
    return;
  }

  if (action === "save-storyboard-description") {
    const storyboards = getActiveStoryboards(workbench);
    const selectedStoryboard = getSelectedStoryboard(storyboards, workbench.ui.selectedStoryboardId);
    if (!selectedStoryboard) {
      workbench.ui.isStoryboardDescriptionModalOpen = false;
      workbench.ui.storyboardDescriptionDraft = "";
      render(workbench);
      return;
    }

    const nextDescription =
      workbench.ui.storyboardDescriptionDraft.trim() || "Please describe the storyboard content.";
    if (selectedStoryboard.linkedShotId) {
      await runAction(workbench, "婵犵數濮甸鏍窗濡ゅ啯宕查柟閭﹀枛缁躲倝鏌﹀Ο渚闁肩増瀵ч妵鍕疀閹炬潙娅ч梺宕囨嚀缁夌數鎹㈠┑瀣棃婵炴垶鐟Λ銈夋⒑閸︻厽娅曞┑鐐╁亾闂佸搫鏈惄顖炵嵁閹烘绠ｉ柣鎴濇閿涘棝姊绘担鍛婃儓婵☆偅顨婇獮濠傤潨閳ь剟鎮伴鈧獮姗€宕烽鐘虫緫婵犳鍠楅敃鈺呭礈濞戞瑦娅?..", async () => {
        await workbench.api.updateShot({
          shotId: selectedStoryboard.linkedShotId,
          description: nextDescription,
        });
        workbench.ui.isStoryboardDescriptionModalOpen = false;
        workbench.ui.storyboardDescriptionDraft = "";
      });
      return;
    }

    const nextStoryboards = storyboards.map((storyboard) =>
      storyboard.id === selectedStoryboard.id
        ? {
            ...storyboard,
            description: nextDescription,
          }
        : storyboard,
    );
    replaceActiveStoryboards(workbench, nextStoryboards);
    workbench.ui.isStoryboardDescriptionModalOpen = false;
    workbench.ui.storyboardDescriptionDraft = "";
    workbench.ui.toast = "Storyboard description updated.";
    render(workbench);
    return;
  }

  if (action === "set-muse-board-mode") {
    workbench.ui.museBoardMode = target.dataset.mode ?? "operation";
    workbench.ui.musePromptMenu = null;
    render(workbench);
    return;
  }

  if (action === "set-muse-scope-mode") {
    workbench.ui.museScopeMode = target.dataset.mode ?? "storyboard";
    render(workbench);
    return;
  }

  if (action === "toggle-muse-prompt-menu") {
    const menu = target.dataset.menu ?? "";
    workbench.ui.musePromptMenu = workbench.ui.musePromptMenu === menu ? null : menu;
    workbench.ui.isVideoModelMenuOpen = false;
    workbench.ui.openGenerationSelectMenu = null;
    render(workbench);
    return;
  }

  if (action === "select-muse-preset") {
    workbench.ui.referencePromptPreset = target.dataset.value ?? workbench.ui.referencePromptPreset;
    workbench.ui.musePromptMenu = null;
    render(workbench);
    return;
  }

  if (action === "quick-append-selected-asset") {
    const result = appendSelectedEpisodeAssetToPrompt(workbench);
    if (!result.ok) {
      workbench.ui.toast = result.toast ?? "当前没有可快捷引用的资产。";
      render(workbench);
      return;
    }
    render(workbench);
    return;
  }

  if (action === "episode-fixed-result-action") {
    const resultAction = target.dataset.resultAction ?? "";
    if (resultAction === "download") {
      const imageResult = workbench.ui.imageGenerationResult;
      const firstImage = Array.isArray(imageResult?.fixedImages) ? imageResult.fixedImages[0] : null;
      const downloadUrl = firstImage?.url ?? null;
      if (downloadUrl) {
        triggerBrowserDownload(downloadUrl, normalizeDownloadName(firstImage?.label ?? "generated-image", downloadUrl));
        workbench.ui.toast = "已开始下载当前结果。";
      } else {
        workbench.ui.toast = "当前没有可下载的结果。";
      }
      render(workbench);
      return;
    }

    if (resultAction === "delete") {
      const imageResult = workbench.ui.imageGenerationResult;
      const firstImage = Array.isArray(imageResult?.fixedImages) ? imageResult.fixedImages[0] : null;
      if (
        isRealEpisodeWorkbench(workbench) &&
        typeof workbench.api.deleteFileResource === "function" &&
        isUuidLike(firstImage?.storageObjectId ?? null)
      ) {
        try {
          workbench.ui.busy = true;
          render(workbench);
          await workbench.api.deleteFileResource(workbench.ui.selectedEpisodeId, firstImage.storageObjectId, {
            assetVersionId: firstImage.id ?? null,
            storageObjectId: firstImage.storageObjectId,
          });
          workbench.ui.toast = "已删除当前结果。";
          await refresh(workbench);
        } catch (error) {
          workbench.ui.toast = `删除失败：${friendlyError(error)}`;
        } finally {
          workbench.ui.busy = false;
          render(workbench);
        }
        return;
      }
      workbench.ui.toast = "已移除当前结果。";
      render(workbench);
      return;
    }

    if (resultAction === "edit") {
      workbench.ui.isStoryboardDescriptionModalOpen = true;
      workbench.ui.toast = "已回填当前提示词，可继续编辑。";
      render(workbench);
      return;
    }

    if (resultAction === "text-to-image") {
      workbench.ui.toast = "已切换到文字改图模式。";
      render(workbench);
      return;
    }

    if (resultAction === "set-character") {
      const imageResult = workbench.ui.imageGenerationResult;
      const firstImage = Array.isArray(imageResult?.fixedImages) ? imageResult.fixedImages[0] : null;
      const selectedAssetId = workbench.ui.selectedEpisodeAssetId ?? workbench.ui.selectedEpisodeCardId ?? null;
      if (!(firstImage?.url && selectedAssetId)) {
        workbench.ui.toast = "当前结果还不能设为角色图。";
        render(workbench);
        return;
      }
      if (
        isRealEpisodeWorkbench(workbench) &&
        typeof workbench.api.setFixedImage === "function" &&
        isUuidLike(selectedAssetId) &&
        isUuidLike(firstImage.id ?? null)
      ) {
        await runAction(workbench, "正在设置角色固定图...", async () => {
          const result = await workbench.api.setFixedImage(
            workbench.ui.selectedEpisodeId,
            selectedAssetId,
            {
              assetVersionId: firstImage.id,
              storageObjectId: firstImage.storageObjectId ?? null,
            },
          );
          const file = result?.file ?? {};
          const nextPreviewUrl = file.previewUrl ?? firstImage.url;
          const nextAssets = cloneImportedAssets(workbench.ui.importedAssets);
          for (const assetKind of ["character", "scene", "prop"]) {
            nextAssets[assetKind] = (nextAssets[assetKind] ?? []).map((item) =>
              item.id === selectedAssetId
                ? {
                    ...item,
                    preview: nextPreviewUrl,
                    previewUrl: nextPreviewUrl,
                    sourceUrl: nextPreviewUrl,
                    latestVersion: item.latestVersion
                      ? {
                          ...item.latestVersion,
                          storageObjectId: file.storageObjectId ?? item.latestVersion.storageObjectId ?? null,
                          previewUrl: nextPreviewUrl,
                        }
                      : item.latestVersion,
                  }
                : item,
            );
          }
          workbench.ui.importedAssets = nextAssets;
          workbench.ui.toast = "已设为角色固定图。";
        });
        return;
      }
      const nextAssets = cloneImportedAssets(workbench.ui.importedAssets);
      nextAssets.character = (nextAssets.character ?? []).map((item) =>
        item.id === selectedAssetId
          ? {
              ...item,
              preview: firstImage.url,
              previewUrl: firstImage.url,
              sourceUrl: firstImage.url,
            }
          : item,
      );
      workbench.ui.importedAssets = nextAssets;
      workbench.ui.toast = "已设为角色固定图。";
      render(workbench);
      return;
    }

    workbench.ui.toast = "该结果操作暂未支持。";
    render(workbench);
    return;
  }

  if (action === "episode-result-action") {
    const resultAction = target.dataset.resultAction ?? "";
    const mediaKind = target.dataset.mediaKind ?? workbench.ui.episodeMediaMode ?? "image";
    const selectedStoryboard = getSelectedStoryboard(
      getActiveStoryboards(workbench),
      workbench.ui.selectedStoryboardId,
    );
    collectEpisodeWorkbenchEvent(workbench, "result.action", {
      resultAction,
      mediaKind,
      storyboard: selectedStoryboard,
    });

    if (resultAction === "edit") {
      workbench.ui.isStoryboardDescriptionModalOpen = true;
      workbench.ui.storyboardDescriptionDraft = workbench.ui.prompt ?? selectedStoryboard?.description ?? "";
      workbench.ui.toast = "已回填当前提示词，可继续编辑。";
      render(workbench);
      return;
    }

    if (resultAction === "set-storyboard-video") {
      const video =
        (selectedStoryboard?.uploadedVideos ?? []).find((item) => item.status === "ready" && item.src) ??
        null;
      if (selectedStoryboard?.id && video?.id) {
        await setStoryboardVideoResult(workbench, selectedStoryboard.id, video.id);
        return;
      }
      workbench.ui.toast = "当前没有可设为分镜视频的结果。";
      render(workbench);
      return;
    }

    if (resultAction === "download") {
      if (mediaKind === "video") {
        downloadStoryboardVideo(
          workbench,
          selectedStoryboard?.id ?? "",
          selectedStoryboard?.selectedUploadedVideoId ?? selectedStoryboard?.uploadedVideos?.[0]?.id ?? "",
        );
      } else {
        downloadStoryboardImage(
          workbench,
          selectedStoryboard?.id ?? "",
          selectedStoryboard?.currentImageAssetVersionId ?? selectedStoryboard?.uploadedImages?.[0]?.id ?? "",
        );
      }
      render(workbench);
      return;
    }

    if (resultAction === "set-storyboard-image") {
      const imageId =
        selectedStoryboard?.currentImageAssetVersionId ??
        selectedStoryboard?.uploadedImages?.[0]?.id ??
        "";
      await setStoryboardImageResult(workbench, selectedStoryboard?.id ?? "", imageId);
      return;
    }

    if (resultAction === "delete") {
      if (mediaKind === "video") {
        const videoId =
          selectedStoryboard?.selectedUploadedVideoId ??
          selectedStoryboard?.uploadedVideos?.[0]?.id ??
          "";
        workbench.ui.storyboardVideoDeleteTarget = {
          storyboardId: selectedStoryboard?.id ?? "",
          videoId,
        };
      } else {
        const imageId =
          selectedStoryboard?.currentImageAssetVersionId ??
          selectedStoryboard?.uploadedImages?.[0]?.id ??
          "";
        workbench.ui.storyboardImageDeleteTarget = {
          storyboardId: selectedStoryboard?.id ?? "",
          imageId,
        };
      }
      render(workbench);
      return;
    }

    workbench.ui.toast = "该结果操作暂未支持。";
    render(workbench);
    return;
  }

  if (action === "open-episode-batch-actions") {
    const selectedIds = new Set(workbench.ui.selectedEpisodeAssetIds ?? []);
    const allAssets = [
      ...(workbench.ui.importedAssets?.character ?? []),
      ...(workbench.ui.importedAssets?.scene ?? []),
      ...(workbench.ui.importedAssets?.prop ?? []),
    ];
    const fallbackSelected = selectedIds.size
      ? []
      : [
          { id: "mock-character-1", name: "?? 1", kind: "character" },
          { id: "mock-character-2", name: "角色 2", kind: "character" },
          { id: "mock-character-3", name: "?? 3", kind: "character" },
        ];
    const items = selectedIds.size
      ? allAssets.filter((item) => selectedIds.has(item.id))
      : fallbackSelected;
    workbench.ui.episodeBatchModal = {
      show: true,
      items,
    };
    collectEpisodeWorkbenchEvent(workbench, "batch.open", {
      selectedAssetIds: [...selectedIds],
      itemCount: items.length,
      items,
    });
    render(workbench);
    return;
  }

  if (action === "close-episode-batch-modal") {
    workbench.ui.episodeBatchModal = null;
    render(workbench);
    return;
  }

  if (action === "remove-quick-reference") {
    const selectedStoryboard = getSelectedStoryboard(
      getActiveStoryboards(workbench),
      workbench.ui.selectedStoryboardId,
    );
    if (!selectedStoryboard) {
      return;
    }
    const referenceId = target.dataset.referenceId ?? "";
    updateStoryboardGenerationState(workbench, selectedStoryboard.id, (generationState) => ({
      ...generationState,
      quickReferenceItems: (generationState.quickReferenceItems ?? []).filter((item) => item.id !== referenceId),
    }));
    render(workbench);
    return;
  }

  if (action === "open-episode-workbench-attachment-picker") {
    const attachmentType = target.dataset.attachmentType ?? "image";
    const input = workbench.root.querySelector(
      `.episode-workbench-attachment-input[data-attachment-type="${escapeAttributeSelector(attachmentType)}"]`,
    );
    input?.click?.();
    return;
  }

  if (action === "toggle-episode-workbench-attachment-selection") {
    const attachmentId = target.dataset.attachmentId ?? "";
    const current = new Set(workbench.ui.episodeWorkbenchSelectedAttachmentIds ?? []);
    if (current.has(attachmentId)) {
      current.delete(attachmentId);
    } else if (attachmentId) {
      current.add(attachmentId);
    }
    workbench.ui.episodeWorkbenchSelectedAttachmentIds = [...current];
    render(workbench);
    return;
  }

  if (action === "remove-episode-workbench-attachment") {
    const attachmentId = target.dataset.attachmentId ?? "";
    workbench.ui.episodeWorkbenchAttachments = (workbench.ui.episodeWorkbenchAttachments ?? []).filter(
      (item) => item.id !== attachmentId,
    );
    workbench.ui.episodeWorkbenchSelectedAttachmentIds = (workbench.ui.episodeWorkbenchSelectedAttachmentIds ?? []).filter(
      (item) => item !== attachmentId,
    );
    workbench.ui.toast = "鐎规瓕灏欎簺闂傚嫨鍊曞顒勬嚀閸愵亞顦遍柡澶嬪姂";
    render(workbench);
    return;
  }

  if (action === "remove-episode-workbench-attachment") {
    const attachmentId = target.dataset.attachmentId ?? "";
    workbench.ui.episodeWorkbenchAttachments = (workbench.ui.episodeWorkbenchAttachments ?? []).filter(
      (item) => item.id !== attachmentId,
    );
    workbench.ui.toast = "鐎规瓕灏欎簺闂傚嫨鍊曞顒勬嚀閸愵亞顦遍柡澶嬪姂";
    render(workbench);
    return;
  }

  if (action === "set-episode-media-mode") {
    workbench.ui.episodeMediaMode = target.dataset.mode ?? "image";
    if (workbench.ui.episodeMediaMode === "image") {
      workbench.ui.selectedModelId =
        workbench.ui.imageGenerationMode === "multi-image" ? "tnb-pro" : "jimeng-4-5";
      workbench.ui.videoAudioEnabled = false;
      workbench.ui.videoMusicEnabled = false;
      workbench.ui.videoLipSyncEnabled = false;
    } else if (workbench.ui.episodeMediaMode === "video") {
      workbench.ui.selectedModelId =
        workbench.ui.videoGenerationMode === "reference-video"
          ? "seedance-2-0-vip"
          : workbench.ui.videoGenerationMode === "first-last-frame"
            ? "hailuo-2-0"
            : workbench.ui.videoGenerationMode === "edit-video"
              ? "happy-horse"
              : "vidu-q3-pro";
    } else if (workbench.ui.episodeMediaMode === "lip-sync") {
      workbench.ui.selectedModelId = "vidu-q3-pro";
    }
    workbench.ui.musePromptMenu = null;
    render(workbench);
    return;
  }

  if (action === "episode-asset-search") {
    return;
  }

  if (action === "set-video-generation-mode") {
    workbench.ui.episodeMediaMode = "video";
    workbench.ui.videoGenerationMode = target.dataset.mode ?? "first-frame";
    if (workbench.ui.videoGenerationMode === "first-last-frame") {
      workbench.ui.selectedModelId = "hailuo-2-0";
      workbench.ui.videoDurationSec = "6";
      workbench.ui.videoResolution = "1080p";
    } else if (workbench.ui.videoGenerationMode === "reference-video") {
      workbench.ui.selectedModelId = "seedance-2-0-vip";
      workbench.ui.videoDurationSec = "15";
      workbench.ui.videoResolution = "2K";
    } else if (workbench.ui.videoGenerationMode === "first-frame") {
      workbench.ui.selectedModelId = "vidu-q3-pro";
      workbench.ui.videoDurationSec = "15";
      workbench.ui.videoResolution = "1080p";
    } else if (workbench.ui.videoGenerationMode === "edit-video") {
      workbench.ui.selectedModelId = "happy-horse";
      workbench.ui.videoResolution = "1080p";
    }
    workbench.ui.isVideoModelMenuOpen = false;
    workbench.ui.openGenerationSelectMenu = null;
    workbench.ui.isFirstFrameMenuOpen = false;
    workbench.ui.activeGenerationFrameMenu = null;
    workbench.ui.referenceAssetPickerKind = null;
    render(workbench);
    return;
  }

  if (action === "set-image-generation-mode") {
    workbench.ui.episodeMediaMode = "image";
    workbench.ui.imageGenerationMode = target.dataset.mode ?? "single-image";
    if (workbench.ui.imageGenerationMode === "multi-image") {
      workbench.ui.selectedModelId = "tnb-pro";
      workbench.ui.imageCount = 9;
    } else {
      workbench.ui.selectedModelId = "jimeng-4-5";
      workbench.ui.imageCount = 1;
    }
    workbench.ui.isVideoModelMenuOpen = false;
    workbench.ui.openGenerationSelectMenu = null;
    render(workbench);
    return;
  }

  if (action === "open-project-workspace") {
    const projectId = target.dataset.projectId ?? null;
    workbench.ui.selectedProjectCardId = projectId;
    workbench.ui.selectedEpisodeId = getDefaultEpisodeWorkbenchId(workbench);
    workbench.ui.activeNavTab = "project";
    workbench.ui.projectPanelMode = "workspace";
    workbench.ui.projectInteriorStatusMenuOpen = false;
    workbench.ui.projectInteriorSection = "overview";
    workbench.ui.assetGeneratorModal = null;
    workbench.ui.toast = "濠殿喗绻愮徊钘夛耿椤忓懏浜ゆ繛鎴灻鍐差渻閵堝懏璐℃繛鍙夋緲椤斿繘濡烽妶鍥┾枙闂?..";
    window.location.hash = "project-workspace";
    render(workbench);
    try {
      const detail = await workbench.api.selectProject({ projectId });
      applyProjectDetail(workbench, detail);
      const nextStoryboards = syncStoryboards(
        workbench.ui.storyboards,
        createStoryboardList(workbench.state),
      );
      workbench.ui.storyboards = nextStoryboards;
      workbench.ui.episodeStoryboardMap = syncEpisodeStoryboardMap(
        workbench.ui.episodeStoryboardMap,
        nextStoryboards,
        getDetailEpisodes(workbench.state),
      );
      workbench.ui.selectedEpisodeId = getDefaultEpisodeWorkbenchId(workbench);
      syncSelectedStoryboardId(workbench, getActiveStoryboards(workbench, nextStoryboards));
      await syncProjectInteriorSupplementary(workbench);
      await syncProjectLibraryFromApi(workbench);
      workbench.ui.toast = "?????????";
    } catch (error) {
      workbench.ui.projectPanelMode = "library";
      workbench.ui.toast = `打开项目失败：${friendlyError(error)}`;
    }
    render(workbench);
    return;
  }

  if (action === "open-episode-workbench") {
    const episodeId = target.dataset.episodeId ?? "episode-primary";
    await enterEpisodeWorkbench(workbench, episodeId, {
      toast: "Entered the episode workspace.",
    });
    return;
  }

  if (action === "back-to-episode-hub") {
    workbench.ui.selectedEpisodeId = null;
    workbench.ui.projectPanelMode = "workspace";
    workbench.ui.projectInteriorSection = "episodes";
    workbench.ui.episodeCardMenuId = null;
    workbench.ui.toast = "Returned to the episode list.";
    window.location.hash = "project-workspace";
    render(workbench);
    return;
  }

  if (action === "toggle-project-status-menu") {
    workbench.ui.projectStatusMenuOpen = !workbench.ui.projectStatusMenuOpen;
    render(workbench);
    return;
  }

  if (action === "toggle-project-interior-status-menu") {
    workbench.ui.projectInteriorStatusMenuOpen = !workbench.ui.projectInteriorStatusMenuOpen;
    render(workbench);
    return;
  }

  if (action === "set-project-interior-section") {
    workbench.ui.projectInteriorSection = target.dataset.section ?? "overview";
    workbench.ui.projectInteriorStatusMenuOpen = false;
    workbench.ui.assetGeneratorModal = null;
    if (workbench.ui.selectedProjectCardId) {
      await syncProjectInteriorSupplementary(workbench);
    }
    render(workbench);
    return;
  }

  if (action === "__legacy-open-single-episode-flow") {
    openSingleEpisodeFlow(workbench);
    return;
  }

  if (action === "__legacy-open-batch-episode-flow") {
    openBatchEpisodeFlow(workbench);
    return;
    workbench.ui.projectInteriorSection = "episodes";
    workbench.ui.isScriptModalOpen = true;
    workbench.ui.scriptTab = "script-upload";
    workbench.ui.scriptSubmitAction = "confirm-batch-episode";
    workbench.ui.scriptSubmitLabel = "??????";
    workbench.ui.uploadNotice = "";
    render(workbench);
    return;
  }

  if (action === "close-single-episode-modal") {
    resetSingleEpisodeModalState(workbench);
    render(workbench);
    return;
  }

  if (action === "create-empty-single-episode") {
    const nextName = getNextEpisodeTitle(getDetailEpisodes(workbench.state));
    await createSingleEpisodeAndEnterWorkbench(workbench, nextName);
    return;
  }

  if (action === "set-single-episode-aspect") {
    workbench.ui.singleEpisodeAspectRatio = target.dataset.aspect ?? "9:16";
    render(workbench);
    return;
  }

  if (action === "confirm-single-episode") {
    const nextScript = workbench.ui.singleEpisodeScript.trim();
    if (!nextScript) {
      workbench.ui.singleEpisodeNotice = "?????????????????";
      render(workbench);
      return;
    }
    const nextName = buildSingleEpisodeTitle(nextScript, getDetailEpisodes(workbench.state));
    workbench.ui.singleEpisodeName = nextName;
    await runAction(workbench, "濠电姵顔栭崰妤冩崲閹邦喖绶ら柦妯侯檧閼版寧銇勮箛鎾跺缂佲偓閸℃绠鹃柟瀵稿剱閻掔晫绱掗幉瀣暤闁哄本鐩獮妯何旈埀顒€煤閿曞倹鍤?..", async () => {
      await createSingleEpisodeAndEnterWorkbench(workbench, nextName, { skipRunAction: true });
    });
    return;
  }

  if (action === "open-single-episode-flow") {
    openSingleEpisodeFlow(workbench);
    return;
  }

  if (action === "open-batch-episode-flow") {
    openBatchEpisodeFlow(workbench);
    return;
  }

  if (action === "open-episode-export-history") {
    workbench.ui.projectInteriorSection = "stats";
    if (workbench.ui.selectedProjectCardId) {
      await syncProjectInteriorSupplementary(workbench);
    }
    render(workbench);
    return;
  }

  if (action === "toggle-episode-card-menu") {
    const episodeId = target.dataset.episodeId ?? null;
    workbench.ui.episodeCardMenuId =
      workbench.ui.episodeCardMenuId === episodeId ? null : episodeId;
    workbench.ui.assetCardMenuId = null;
    render(workbench);
    return;
  }

  if (action === "rename-episode-card") {
    const episodeId = target.dataset.episodeId ?? "";
    const episode = getDetailEpisodes(workbench.state).find((item) => item.id === episodeId);
    workbench.ui.renameEpisodeId = episodeId;
    workbench.ui.renameEpisodeName = episode?.title ?? "";
    workbench.ui.renameEpisodeNotice = "";
    workbench.ui.episodeCardMenuId = null;
    render(workbench);
    return;
  }

  if (action === "close-rename-episode-modal") {
    workbench.ui.renameEpisodeId = null;
    workbench.ui.renameEpisodeName = "";
    workbench.ui.renameEpisodeNotice = "";
    render(workbench);
    return;
  }

  if (action === "confirm-rename-episode-card") {
    const episodeId = workbench.ui.renameEpisodeId;
    const nextName = workbench.ui.renameEpisodeName.trim();
    if (!nextName) {
      workbench.ui.renameEpisodeNotice = "Please enter an episode name.";
      render(workbench);
      return;
    }
    await runAction(workbench, "濠电姵顔栭崰妤冩崲閹邦喖绶ら柦妯侯檧閼版寧銇勮箛鎾跺闁绘挸鍊婚埀顒€绠嶉崕閬嶅箠韫囨稑鍚归柟鐑橆殕閻撴洘鎱ㄥ鍡楀鐎涙繃绻濋埛鈧崒婊呯厯濠?..", async () => {
      await workbench.api.updateEpisode({
        episodeId,
        title: nextName,
      });
      if (workbench.ui.selectedProjectCardId) {
        applyProjectDetail(
          workbench,
          await workbench.api.getProjectDetail(workbench.ui.selectedProjectCardId),
        );
      }
      workbench.ui.renameEpisodeId = null;
      workbench.ui.renameEpisodeName = "";
      workbench.ui.renameEpisodeNotice = "";
    });
    return;
  }

  if (action === "delete-episode-card") {
    workbench.ui.deleteEpisodeId = target.dataset.episodeId ?? null;
    workbench.ui.episodeCardMenuId = null;
    render(workbench);
    return;
  }

  if (action === "close-delete-episode-modal") {
    workbench.ui.deleteEpisodeId = null;
    render(workbench);
    return;
  }

  if (action === "confirm-delete-episode-card") {
    const episodeId = workbench.ui.deleteEpisodeId;
    if (!episodeId) {
      return;
    }
    await runAction(workbench, "濠电姵顔栭崰妤冩崲閹邦喖绶ら柦妯侯檧閼版寧銇勮箛鎾跺缂佲偓閸℃稒鐓熸俊顖濆亹鐢盯鏌ｅ┑鍫濇灈闁哄本鐩獮妯何旈埀顒€煤閿曞倹鍤?..", async () => {
      await workbench.api.deleteEpisode({ episodeId });
      if (workbench.ui.selectedEpisodeId === episodeId) {
        workbench.ui.selectedEpisodeId = null;
        workbench.ui.projectPanelMode = "workspace";
        workbench.ui.projectInteriorSection = "episodes";
        workbench.ui.selectedStoryboardId = null;
        window.location.hash = "project-workspace";
      }
      if (workbench.ui.selectedProjectCardId) {
        applyProjectDetail(
          workbench,
          await workbench.api.getProjectDetail(workbench.ui.selectedProjectCardId),
        );
      }
      workbench.ui.deleteEpisodeId = null;
      workbench.ui.episodeCardMenuId = null;
    });
    return;
  }

  if (action === "open-project-asset-tab") {
    clearAssetLibraryReturnState(workbench);
    workbench.ui.projectInteriorSection = "assets";
    workbench.ui.projectAssetTab = target.dataset.assetKind ?? "character";
    workbench.ui.projectInteriorStatusMenuOpen = false;
    workbench.ui.assetGeneratorModal = null;
    render(workbench);
    return;
  }

  if (action === "set-project-asset-tab") {
    clearAssetLibraryReturnState(workbench);
    workbench.ui.projectAssetTab = target.dataset.assetTab ?? "character";
    workbench.ui.episodeWorkbenchScrollTarget =
      workbench.ui.projectPanelMode === "episode-workbench" ? null : workbench.ui.projectAssetTab;
    workbench.ui.projectInteriorStatusMenuOpen = false;
    workbench.ui.assetCardMenuId = null;
    render(workbench);
    return;
  }

  if (action === "set-project-other-asset-media") {
    clearAssetLibraryReturnState(workbench);
    workbench.ui.projectOtherAssetMediaType = target.dataset.mediaType ?? "video";
    workbench.ui.assetCardMenuId = null;
    render(workbench);
    return;
  }

  if (action === "toggle-asset-sort-order") {
    workbench.ui.assetSortOrder = workbench.ui.assetSortOrder === "desc" ? "asc" : "desc";
    render(workbench);
    return;
  }

  if (action === "toggle-asset-filter-mode") {
    workbench.ui.assetFilterMode =
      workbench.ui.assetFilterMode === "all"
        ? "with-preview"
        : workbench.ui.assetFilterMode === "with-preview"
          ? "generated"
          : "all";
    render(workbench);
    return;
  }

  if (action === "set-asset-view-mode") {
    workbench.ui.assetViewMode = target.dataset.viewMode === "list" ? "list" : "grid";
    render(workbench);
    return;
  }

  if (action === "toggle-asset-card-menu") {
    const assetMenuId = target.dataset.assetMenuId ?? null;
    workbench.ui.assetCardMenuId =
      workbench.ui.assetCardMenuId === assetMenuId ? null : assetMenuId;
    workbench.ui.projectCardMenuId = null;
    workbench.ui.episodeCardMenuId = null;
    render(workbench);
    return;
  }

  if (action === "edit-imported-asset") {
    const assetId = target.dataset.assetId ?? "";
    const assetKind = target.dataset.assetKind ?? workbench.ui.projectAssetTab ?? "character";
    const mediaType = target.dataset.mediaType ?? workbench.ui.projectOtherAssetMediaType ?? "video";
    const asset = findImportedAsset(workbench.ui.importedAssets, assetKind, mediaType, assetId);
    workbench.ui.assetGeneratorModal = assetKind;
    workbench.ui.assetGeneratorMode = "edit";
    workbench.ui.assetGeneratorEditingAsset = asset
      ? { ...asset, assetKind, mediaType }
      : null;
    workbench.ui.assetGeneratorName = asset?.name ?? "";
    workbench.ui.assetGeneratorPrompt = asset?.description ?? "";
    workbench.ui.assetCardMenuId = null;
    render(workbench);
    return;
  }

  if (action === "rename-imported-asset") {
    const assetId = target.dataset.assetId ?? "";
    const assetKind = target.dataset.assetKind ?? workbench.ui.projectAssetTab ?? "character";
    const mediaType = target.dataset.mediaType ?? workbench.ui.projectOtherAssetMediaType ?? "video";
    const asset = findImportedAsset(workbench.ui.importedAssets, assetKind, mediaType, assetId);
    workbench.ui.renameImportedAsset = { assetId, assetKind, mediaType, name: asset?.name ?? "" };
    workbench.ui.renameImportedAssetName = asset?.name ?? "";
    workbench.ui.renameImportedAssetNotice = "";
    workbench.ui.assetCardMenuId = null;
    render(workbench);
    return;
  }

  if (action === "close-rename-imported-asset-modal") {
    workbench.ui.renameImportedAsset = null;
    workbench.ui.renameImportedAssetName = "";
    workbench.ui.renameImportedAssetNotice = "";
    render(workbench);
    return;
  }

  if (action === "__legacy-real-confirm-rename-imported-asset") {
    return;
  }

  if (action === "__legacy-confirm-rename-imported-asset") {
    const draft = workbench.ui.renameImportedAsset;
    const normalizedName = workbench.ui.renameImportedAssetName.trim();
    if (!normalizedName) {
      workbench.ui.renameImportedAssetNotice = "Please enter an asset name.";
      render(workbench);
      return;
    }
    if (!draft?.assetId) {
      return;
    }
    await runAction(workbench, "濠电姵顔栭崰妤冩崲閹邦喖绶ら柦妯侯檧閼版寧銇勮箛鎾跺闁绘挸鍊婚埀顒€绠嶉崕閬嶅箠韫囨稑鍚归柟鐑橆殕閻撴洘鎱ㄥ鍡楀閸熷摜绱撴担椋庤窗闁稿鎳愮划?..", async () => {
      await workbench.api.updateProjectAsset(draft.assetId, {
        name: normalizedName,
      });
      if (workbench.ui.selectedProjectCardId) {
        applyProjectDetail(
          workbench,
          await workbench.api.getProjectDetail(workbench.ui.selectedProjectCardId),
        );
      }
      workbench.ui.renameImportedAsset = null;
      workbench.ui.renameImportedAssetName = "";
      workbench.ui.renameImportedAssetNotice = "";
    });
    return;
  }

  if (action === "confirm-rename-imported-asset") {
    const draft = workbench.ui.renameImportedAsset;
    const normalizedName = workbench.ui.renameImportedAssetName.trim();
    if (!normalizedName) {
      workbench.ui.renameImportedAssetNotice = "Please enter an asset name.";
      render(workbench);
      return;
    }
    if (draft) {
      workbench.ui.importedAssets = mapImportedAssets(
        workbench.ui.importedAssets,
        draft.assetKind,
        draft.mediaType,
        (item) => (item.id === draft.assetId ? { ...item, name: normalizedName } : item),
      );
      workbench.ui.toast = `闂佽娴烽幊鎾诲箟閿熺姵鍋傞柨鐔哄Т闂傤垶鏌熼梻瀵割槮鐎瑰憡绻堥弻锕€螣娓氼垱效闂佺锕ら崯鍧楀煡?${normalizedName}`;
    }
    workbench.ui.renameImportedAsset = null;
    workbench.ui.renameImportedAssetName = "";
    workbench.ui.renameImportedAssetNotice = "";
    render(workbench);
    return;
  }

  if (action === "download-imported-asset") {
    const assetId = target.dataset.assetId ?? "";
    const assetKind = target.dataset.assetKind ?? workbench.ui.projectAssetTab ?? "character";
    const mediaType = target.dataset.mediaType ?? workbench.ui.projectOtherAssetMediaType ?? "video";
    const asset = findImportedAsset(workbench.ui.importedAssets, assetKind, mediaType, assetId);
    if (!asset?.preview) {
      workbench.ui.toast = "???????????";
      workbench.ui.assetCardMenuId = null;
      render(workbench);
      return;
    }
    triggerAssetDownload(asset.preview, asset.name, mediaType === "video" ? "mp4" : "png");
    workbench.ui.assetCardMenuId = null;
    workbench.ui.toast = `????? ${asset.name}`;
    render(workbench);
    return;
  }

  if (action === "delete-imported-asset") {
    const assetId = target.dataset.assetId ?? "";
    const assetKind = target.dataset.assetKind ?? workbench.ui.projectAssetTab ?? "character";
    const mediaType = target.dataset.mediaType ?? workbench.ui.projectOtherAssetMediaType ?? "video";
    const asset = findImportedAsset(workbench.ui.importedAssets, assetKind, mediaType, assetId);
    workbench.ui.deleteImportedAsset = { assetId, assetKind, mediaType, name: asset?.name ?? "" };
    workbench.ui.assetCardMenuId = null;
    render(workbench);
    return;
  }

  if (action === "close-delete-imported-asset-modal") {
    workbench.ui.deleteImportedAsset = null;
    render(workbench);
    return;
  }

  if (action === "__legacy-confirm-delete-imported-asset") {
    const draft = workbench.ui.deleteImportedAsset;
    if (!draft?.assetId) {
      return;
    }
    await runAction(workbench, "濠电姵顔栭崰妤冩崲閹邦喖绶ら柦妯侯檧閼版寧銇勮箛鎾跺缂佲偓閸℃稒鐓熸俊顖濆亹鐢盯鏌ｅ┑鍫濇灈闁诡喚顢婇ˇ鏌ユ倵濮橀棿绨兼い?..", async () => {
      await workbench.api.deleteProjectAsset(draft.assetId);
      if (workbench.ui.selectedProjectCardId) {
        applyProjectDetail(
          workbench,
          await workbench.api.getProjectDetail(workbench.ui.selectedProjectCardId),
        );
      }
      workbench.ui.deleteImportedAsset = null;
    });
    return;
  }

  if (action === "confirm-delete-imported-asset") {
    const draft = workbench.ui.deleteImportedAsset;
    if (!draft?.assetId) {
      return;
    }
    await runAction(workbench, "婵犳鍠楃换鎰緤閽樺鑰挎い蹇撶墕缁€鍡涙煟濡偐甯涢柣婵堝枔缁辨帗娼忛埡浣囷絾绻?..", async () => {
      await workbench.api.deleteProjectAsset(draft.assetId);
      if (workbench.ui.selectedProjectCardId) {
        applyProjectDetail(
          workbench,
          await workbench.api.getProjectDetail(workbench.ui.selectedProjectCardId),
        );
      } else {
        const nextAssets = cloneImportedAssets(workbench.ui.importedAssets);
        assignImportedAssets(
          nextAssets,
          draft.assetKind,
          draft.mediaType,
          getImportedAssetBucket(nextAssets, draft.assetKind, draft.mediaType).filter((item) => item.id !== draft.assetId),
        );
        workbench.ui.importedAssets = nextAssets;
      }
      workbench.ui.deleteImportedAsset = null;
      workbench.ui.toast = draft.name ? `鐎瑰憡褰冮崹褰掓⒔?${draft.name}` : "鐎瑰憡褰冮崹褰掓⒔閵堝洨顦遍柡澶嬪姂";
    });
    return;
  }

  if (action === "open-asset-import-modal") {
    workbench.ui.assetImportModal = target.dataset.assetKind ?? workbench.ui.projectAssetTab ?? "character";
    workbench.ui.assetImportModalTab = "local";
    workbench.ui.assetImportCategory = "domestic-modern-city";
    workbench.ui.assetImportDrafts = [];
    workbench.ui.assetImportSelection = [];
    render(workbench);
    return;
  }

  if (action === "close-asset-import-modal") {
    workbench.ui.assetImportModal = null;
    workbench.ui.referenceAssetPickerKind = null;
    workbench.ui.assetImportDrafts = [];
    workbench.ui.assetImportSelection = [];
    render(workbench);
    return;
  }

  if (action === "switch-asset-import-tab") {
    workbench.ui.assetImportModalTab = target.dataset.tab ?? "local";
    render(workbench);
    return;
  }

  if (action === "select-asset-import-category") {
    workbench.ui.assetImportCategory = target.dataset.category ?? workbench.ui.assetImportCategory;
    render(workbench);
    return;
  }

  if (action === "toggle-asset-import-draft") {
    const draftId = target.dataset.draftId ?? "";
    workbench.ui.assetImportSelection = toggleSelection(
      workbench.ui.assetImportSelection ?? [],
      draftId,
    );
    render(workbench);
    return;
  }

  if (action === "toggle-official-asset-import") {
    const assetId = target.dataset.assetId ?? "";
    workbench.ui.assetImportSelection = toggleSelection(
      workbench.ui.assetImportSelection ?? [],
      assetId,
    );
    render(workbench);
    return;
  }

  if (action === "confirm-asset-import") {
    const assetKind = workbench.ui.assetImportModal ?? workbench.ui.projectAssetTab ?? "character";
    const selectedIds = new Set(workbench.ui.assetImportSelection ?? []);
    const importKind = assetKind === "other" ? workbench.ui.projectOtherAssetMediaType : assetKind;
    const importRecords = [];
    const importedAssetIds = [];

    if (workbench.ui.assetImportModalTab === "official") {
      importRecords.push(...getOfficialAssetRecords(assetKind, workbench.ui.assetImportCategory)
        .filter((asset) => selectedIds.has(asset.id))
        .map((asset) => ({
          source: "official",
          name: asset.name,
          previewDataUrl: asset.preview,
          mimeType: inferMimeTypeFromDataUrl(asset.preview),
          width: 240,
          height: 240,
        })));
    } else {
      importRecords.push(...(workbench.ui.assetImportDrafts ?? [])
        .filter((draft) => selectedIds.has(draft.id))
        .map((draft) => ({
          name: draft.name?.trim() || "未命名资产",
          uploadSessionId: draft.uploadSessionId ?? null,
          storageObjectId: draft.storageObjectId ?? null,
          storageObjectKey: draft.storageObjectKey ?? draft.preview,
          sourceUrl: draft.sourceUrl ?? draft.preview,
          mimeType: draft.mimeType ?? inferMimeTypeFromDataUrl(draft.preview),
          width: 1024,
          height: 1024,
        })));
    }

    if (!importRecords.length) {
      workbench.ui.toast = "Please choose at least one asset to import.";
      render(workbench);
      return;
    }

    await runAction(workbench, "濠电姵顔栭崰妤冩崲閹邦喖绶ら柦妯侯檧閼版寧銇勮箛鎾搭棏闁稿鎹囬幃浠嬫濞戞ü绮梻浣告啞閻熴儱螞濞戙垹绠扮憸鏂跨暦閻旂⒈鏁傞柛顐犲灩缁€?..", async () => {
      for (const record of importRecords) {
        const importPayload =
          record.source === "official"
            ? await buildOfficialAssetImportPayload(workbench, record, assetKind)
            : record;
        const imported = await workbench.api.importAsset({
          kind: importKind,
          ...importPayload,
        });
        if (imported?.asset?.id) {
          importedAssetIds.push(imported.asset.id);
        }
      }
      if (workbench.ui.selectedProjectCardId) {
        applyProjectDetail(
          workbench,
          await workbench.api.getProjectDetail(workbench.ui.selectedProjectCardId),
        );
      }
      workbench.ui.assetImportModal = null;
      workbench.ui.assetImportDrafts = [];
      workbench.ui.assetImportSelection = [];
    });
    prepareAssetLibraryReturn(workbench, {
      assetKind,
      mediaType: assetKind === "other" ? importKind : "image",
      assetIds: importedAssetIds,
      count: importRecords.length,
    });
    render(workbench);
    return;
  }

  if (action === "open-asset-generator-modal") {
    workbench.ui.assetGeneratorModal = target.dataset.assetKind ?? workbench.ui.projectAssetTab ?? "character";
    workbench.ui.assetGeneratorMode = "generate";
    workbench.ui.assetGeneratorEditingAsset = null;
    workbench.ui.assetGeneratorCharacterType = "human";
    workbench.ui.assetGeneratorStyleValue = "????? / ???";
    workbench.ui.assetGeneratorStyleCategory = "official";
    workbench.ui.assetGeneratorStyleOption = "none";
    workbench.ui.assetGeneratorMaterialCategory = "official";
    workbench.ui.assetGeneratorMaterialOption = "fantasy-doomsday";
    workbench.ui.assetGeneratorImageType = "main";
    workbench.ui.assetGeneratorModel = "闂傚倷绀侀幉锟犮€冩径濞炬瀺闁哄洢鍨归悞?.0";
    workbench.ui.assetGeneratorResolution = "2K";
    workbench.ui.assetGeneratorCount = 1;
    render(workbench);
    return;
  }

  if (action === "close-asset-generator-modal") {
    workbench.ui.assetGeneratorModal = null;
    workbench.ui.assetGeneratorMode = "generate";
    workbench.ui.assetGeneratorEditingAsset = null;
    render(workbench);
    return;
  }

  if (action === "submit-asset-generator") {
    const assetKind = workbench.ui.assetGeneratorModal ?? workbench.ui.projectAssetTab ?? "character";
    const nextName = workbench.ui.assetGeneratorName.trim();
    if (!nextName) {
      workbench.ui.toast = "Please enter an asset name.";
      render(workbench);
      return;
    }
    if (workbench.ui.assetGeneratorMode === "edit" && workbench.ui.assetGeneratorEditingAsset?.id) {
      await runAction(workbench, "濠电姵顔栭崰妤冩崲閹邦喖绶ら柦妯侯檧閼版寧銇勮箛鎾村櫧闁崇懓绉电换婵嬫濞戞瑯妫ら梺鍦櫕婵炩偓闁诡喚顢婇ˇ鏌ユ倵濮橀棿绨兼い?..", async () => {
        await workbench.api.updateProjectAsset(workbench.ui.assetGeneratorEditingAsset.id, {
          name: nextName,
          description: workbench.ui.assetGeneratorPrompt.trim(),
        });
        if (workbench.ui.selectedProjectCardId) {
          applyProjectDetail(
            workbench,
            await workbench.api.getProjectDetail(workbench.ui.selectedProjectCardId),
          );
        }
        workbench.ui.assetGeneratorModal = null;
        workbench.ui.assetGeneratorMode = "generate";
        workbench.ui.assetGeneratorEditingAsset = null;
      });
      return;
    }
    await runAction(workbench, "濠电姵顔栭崰妤冩崲閹邦喖绶ら柦妯侯檧閼版寧銇勮箛鎾跺闁稿鍔戦弻锝夊籍閸屻倗鍔搁梺璇茬箰濞差參骞冪涵鍜佹Щ闁诲孩鍑规禍婵嬨€?..", async () => {
      await workbench.api.generateAsset({
        kind: assetKind === "other" ? workbench.ui.projectOtherAssetMediaType : assetKind,
        name: nextName,
        prompt: workbench.ui.assetGeneratorPrompt.trim(),
        model: workbench.ui.assetGeneratorModel,
        width: 1024,
        height: 1024,
      });
      if (workbench.ui.selectedProjectCardId) {
        applyProjectDetail(
          workbench,
          await workbench.api.getProjectDetail(workbench.ui.selectedProjectCardId),
        );
      }
      workbench.ui.assetGeneratorModal = null;
      workbench.ui.assetGeneratorMode = "generate";
      workbench.ui.assetGeneratorEditingAsset = null;
    });
    return;
  }

  if (action === "set-project-interior-status") {
    const projectId = workbench.ui.selectedProjectCardId;
    const nextStatus = target.dataset.status ?? "In Progress";
    await runAction(workbench, "濠电姵顔栭崰妤冩崲閹邦喖绶ら柦妯侯檧閼版寧銇勮箛鎾跺闁告濞婇幃妤€鈽夊▍铏灴閹繝鍩€椤掍椒绻嗛柣鎰典簻閳ь剚娲栭敃銏ゅ础閻忚崵鍎ょ€佃偐鈧稒锚娴滃綊姊洪悡搴㈡喐妞わ絼绮欏畷?..", async () => {
      await workbench.api.updateProject({
        projectId,
        phase: projectStatusToPhase(nextStatus),
      });
      workbench.ui.projectInteriorStatusMenuOpen = false;
    });
    return;
  }

  if (action === "change-project-page") {
    const nextPage = Number(target.dataset.page ?? workbench.ui.projectLibraryPage ?? 1);
    workbench.ui.projectLibraryPage = Math.max(1, nextPage);
    render(workbench);
    return;
  }

  if (action === "toggle-project-card-menu") {
    const projectId = target.dataset.projectId ?? null;
    workbench.ui.projectCardMenuId =
      workbench.ui.projectCardMenuId === projectId ? null : projectId;
    workbench.ui.assetCardMenuId = null;
    render(workbench);
    return;
  }

  if (action === "pick-project-cover") {
    if (target.tagName === "LABEL") {
      return;
    }
    const projectId = target.dataset.projectId ?? null;
    findProjectCoverInput(workbench.root, projectId)?.click();
    return;
  }

  if (action === "pick-asset-import-files") {
    target.querySelector(".asset-import-file-input")?.click();
    return;
  }

  if (action === "pick-local-video-upload") {
    const storyboardId = target.dataset.storyboardId ?? workbench.ui.selectedStoryboardId ?? "";
    findScopedInput(
      workbench.root,
      target,
      `.local-video-upload-input[data-storyboard-id="${storyboardId}"]`,
    )?.click();
    return;
  }

  if (action === "pick-local-storyboard-image") {
    const storyboardId = target.dataset.storyboardId ?? workbench.ui.selectedStoryboardId ?? "";
    findScopedInput(
      workbench.root,
      target,
      `.local-storyboard-image-input[data-storyboard-id="${storyboardId}"]`,
    )?.click();
    return;
  }

  if (action === "open-generation-upload") {
    const uploadTarget = target.dataset.uploadTarget ?? "";
    if (!uploadTarget) {
      return;
    }
    workbench.ui.isFirstFrameMenuOpen = false;
    workbench.ui.activeGenerationFrameMenu = null;
    findScopedInput(
      workbench.root,
      target,
      `.generation-upload-input[data-upload-target="${uploadTarget}"]`,
    )?.click();
    return;
  }

  if (action === "toggle-video-model-menu") {
    workbench.ui.isVideoModelMenuOpen = !workbench.ui.isVideoModelMenuOpen;
    workbench.ui.openGenerationSelectMenu = null;
    workbench.ui.musePromptMenu = null;
    workbench.ui.isFirstFrameMenuOpen = false;
    workbench.ui.activeGenerationFrameMenu = null;
    render(workbench);
    return;
  }

  if (action === "select-video-model") {
    workbench.ui.selectedModelId = target.dataset.modelId ?? workbench.ui.selectedModelId;
    workbench.ui.isVideoModelMenuOpen = false;
    workbench.ui.musePromptMenu = null;
    workbench.ui.toast = `Selected ${target.dataset.modelName ?? workbench.ui.selectedModelId}.`;
    render(workbench);
    return;
  }

  if (action === "toggle-generation-select-menu") {
    const field = target.dataset.field ?? "";
    workbench.ui.openGenerationSelectMenu =
      workbench.ui.openGenerationSelectMenu === field ? null : field;
    workbench.ui.isVideoModelMenuOpen = false;
    workbench.ui.musePromptMenu = null;
    workbench.ui.activeGenerationFrameMenu = null;
    render(workbench);
    return;
  }

  if (action === "select-generation-field-option") {
    applyGenerationFieldChange(
      workbench,
      target.dataset.field ?? "",
      target.dataset.value ?? "",
    );
    workbench.ui.openGenerationSelectMenu = null;
    workbench.ui.musePromptMenu = null;
    render(workbench);
    return;
  }

  if (action === "toggle-first-frame-menu") {
    workbench.ui.isFirstFrameMenuOpen = !workbench.ui.isFirstFrameMenuOpen;
    workbench.ui.isVideoModelMenuOpen = false;
    workbench.ui.openGenerationSelectMenu = null;
    workbench.ui.activeGenerationFrameMenu = null;
    render(workbench);
    return;
  }

  if (action === "clear-first-frame") {
    updateStoryboardGenerationState(workbench, workbench.ui.selectedStoryboardId ?? "", (state) => ({
      ...state,
      firstFrame: null,
    }));
    workbench.ui.isFirstFrameMenuOpen = false;
    render(workbench);
    return;
  }

  if (action === "toggle-generation-frame-menu") {
    const frameTarget = target.dataset.frameTarget ?? "";
    workbench.ui.activeGenerationFrameMenu =
      workbench.ui.activeGenerationFrameMenu === frameTarget ? null : frameTarget;
    workbench.ui.isVideoModelMenuOpen = false;
    workbench.ui.openGenerationSelectMenu = null;
    workbench.ui.isFirstFrameMenuOpen = false;
    render(workbench);
    return;
  }

  if (action === "open-reference-asset-picker") {
    workbench.ui.referenceAssetPickerKind = target.dataset.assetKind ?? "character";
    workbench.ui.referenceAssetPickerMediaType = target.dataset.mediaType ?? "image";
    workbench.ui.projectAssetTab = workbench.ui.referenceAssetPickerKind;
    workbench.ui.assetImportModal = workbench.ui.referenceAssetPickerKind;
    workbench.ui.assetImportModalTab = "local";
    workbench.ui.assetImportDrafts = [];
    workbench.ui.assetImportSelection = [];
    workbench.ui.isVideoModelMenuOpen = false;
    workbench.ui.openGenerationSelectMenu = null;
    workbench.ui.isFirstFrameMenuOpen = false;
    workbench.ui.activeGenerationFrameMenu = null;
    render(workbench);
    return;
  }

  if (action === "select-reference-asset") {
    const assetId = target.dataset.assetId ?? "";
    const assetKind = target.dataset.assetKind ?? "character";
    const mediaType = target.dataset.mediaType ?? "image";
    const asset =
      findImportedAsset(workbench.ui.importedAssets, assetKind, mediaType, assetId) ??
      findAssetForReference(workbench, assetKind);
    if (!asset?.id) {
      workbench.ui.toast = "Please import a matching asset first.";
      render(workbench);
      return;
    }
    const role = assetKind === "scene" ? "scene" : assetKind === "prop" ? "prop" : "character";
    updateStoryboardGenerationState(workbench, workbench.ui.selectedStoryboardId ?? "", (state) => {
      const nextSelections = [...(state.referenceSelections ?? [])];
      const existingIndex = nextSelections.findIndex((item) => item.role === role);
      const nextSelection = {
        role,
        assetId: asset.id,
        assetKind,
        mediaType,
        name: asset.name ?? "?????",
        preview: asset.preview ?? asset.previewUrl ?? "",
        badge: asset.name ?? "????",
      };
      if (existingIndex >= 0) {
        nextSelections[existingIndex] = nextSelection;
      } else {
        nextSelections.push(nextSelection);
      }
      return {
        ...state,
        localReferenceRoles: toggleSelection((state.localReferenceRoles ?? []).filter((item) => item !== role), role),
        referenceSelections: nextSelections,
      };
    });
    workbench.ui.referenceAssetPickerKind = null;
    workbench.ui.assetImportModal = null;
    syncReferencePrompt(workbench);
    render(workbench);
    return;
  }

  if (action === "remove-reference-asset") {
    const role = target.dataset.referenceRole ?? "character";
    const selectedStoryboard = getSelectedStoryboard(
      getActiveStoryboards(workbench),
      workbench.ui.selectedStoryboardId,
    );
    const applyLocalRemoval = () => {
      updateStoryboardGenerationState(workbench, workbench.ui.selectedStoryboardId ?? "", (state) => ({
        ...state,
        localReferenceRoles: (state.localReferenceRoles ?? []).filter((item) => item !== role),
        referenceSelections: (state.referenceSelections ?? []).filter((item) => item.role !== role),
      }));
      syncReferencePrompt(workbench);
    };
    if (selectedStoryboard?.linkedShotId) {
      await runAction(workbench, "婵犳鍠楃换鎰緤閽樺鑰挎い蹇撴閻挸鈹戦悩宕囶暡闁绘繄鍠栭弻娑樷枎韫囨挴鍋撴禒瀣劦妞ゆ巻鍋撻柛鐔稿缁牆鐣濋崟顐ら獓?..", async () => {
        const nextReferences = (selectedStoryboard.references ?? []).filter((item) => item.role !== role);
        await workbench.api.replaceShotReferences(selectedStoryboard.linkedShotId, {
          items: nextReferences.map((item, index) => ({
            role: item.role,
            assetId: item.assetId,
            assetVersionId: item.assetVersionId ?? null,
            sortOrder: index,
          })),
        });
        applyLocalRemoval();
      });
      return;
    }
    applyLocalRemoval();
    render(workbench);
    return;
  }

  if (action === "set-reference-prompt-preset") {
    workbench.ui.referencePromptPreset = target.dataset.preset ?? "comic-style";
    syncReferencePrompt(workbench);
    render(workbench);
    return;
  }

  if (action === "clear-reference-prompt") {
    workbench.ui.prompt = "";
    render(workbench);
    return;
  }

  if (action === "clear-generation-frame") {
    const frameTarget = target.dataset.frameTarget === "last" ? "lastFrame" : "firstFrame";
    updateStoryboardGenerationState(workbench, workbench.ui.selectedStoryboardId ?? "", (state) => ({
      ...state,
      [frameTarget]: null,
    }));
    workbench.ui.activeGenerationFrameMenu = null;
    render(workbench);
    return;
  }

  if (action === "toggle-generation-frame-crop") {
    const frameTarget = target.dataset.frameTarget === "last" ? "lastFrame" : "firstFrame";
    updateStoryboardGenerationState(workbench, workbench.ui.selectedStoryboardId ?? "", (state) => {
      const frameState = state[frameTarget];
      return {
        ...state,
        [frameTarget]: frameState
          ? {
              ...frameState,
              cropMode: frameState.cropMode === "contain" ? "cover" : "contain",
            }
          : frameState,
      };
    });
    workbench.ui.activeGenerationFrameMenu = null;
    render(workbench);
    return;
  }

  if (action === "use-storyboard-generation-frame") {
    const frameTarget = target.dataset.frameTarget === "last" ? "lastFrame" : "firstFrame";
    const storyboard = getSelectedStoryboard(
      getActiveStoryboards(workbench),
      workbench.ui.selectedStoryboardId,
    );
    if (!storyboard?.previewImageUrl) {
      workbench.ui.toast = "Current storyboard has no image to use yet.";
      render(workbench);
      return;
    }
    updateStoryboardGenerationState(workbench, workbench.ui.selectedStoryboardId ?? "", (state) => ({
      ...state,
      [frameTarget]: {
        name: storyboard.uploadedImageName || `${frameTarget}.png`,
        kind: "image",
        status: "ready",
        summary: frameTarget === "firstFrame" ? "??????????" : "????????????",
        url: storyboard.previewImageUrl,
        cropMode: "cover",
      },
    }));
    workbench.ui.activeGenerationFrameMenu = null;
    render(workbench);
    return;
  }

  if (action === "swap-generation-frames") {
    updateStoryboardGenerationState(workbench, workbench.ui.selectedStoryboardId ?? "", (state) => ({
      ...state,
      firstFrame: state.lastFrame ?? null,
      lastFrame: state.firstFrame ?? null,
    }));
    workbench.ui.toast = "Swapped first and last frame.";
    render(workbench);
    return;
  }

  if (action === "use-storyboard-first-frame") {
    syncGenerationStateFromStoryboardImage(workbench, workbench.ui.selectedStoryboardId ?? "");
    workbench.ui.isFirstFrameMenuOpen = false;
    render(workbench);
    return;
  }

  if (action === "toggle-first-frame-crop") {
    updateStoryboardGenerationState(workbench, workbench.ui.selectedStoryboardId ?? "", (state) => ({
      ...state,
      firstFrame: state.firstFrame
        ? {
            ...state.firstFrame,
            cropMode: state.firstFrame.cropMode === "cover" ? "contain" : "cover",
          }
        : state.firstFrame,
    }));
    workbench.ui.isFirstFrameMenuOpen = false;
    render(workbench);
    return;
  }

  if (action === "set-generation-count") {
    const control = target.dataset.control ?? "";
    const nextCount = Number(target.dataset.count ?? 1);
    if (control === "videoCount") {
      workbench.ui.videoCount = clampCount(nextCount, 1, 4);
    } else if (control === "imageCount") {
      workbench.ui.imageCount = clampCount(nextCount, 1, 4);
    }
    render(workbench);
    return;
  }

  if (action === "set-multi-image-strategy") {
    workbench.ui.multiImageStrategy = target.dataset.strategy ?? "spatial-multi-view";
    render(workbench);
    return;
  }

  if (action === "apply-prompt-preset") {
    const selectedStoryboard = getSelectedStoryboard(
      getActiveStoryboards(workbench),
      workbench.ui.selectedStoryboardId,
    );
    workbench.ui.prompt = buildSuggestedPrompt(selectedStoryboard, workbench.ui);
    render(workbench);
    return;
  }

  if (action === "enhance-prompt") {
    const selectedStoryboard = getSelectedStoryboard(
      getActiveStoryboards(workbench),
      workbench.ui.selectedStoryboardId,
    );
    const basePrompt = (workbench.ui.prompt || selectedStoryboard?.description || "").trim();
    workbench.ui.prompt = [
      basePrompt,
      "Keep the comic style consistent, motion smooth, expressions clear, and framing stable.",
    ]
      .filter(Boolean)
      .join(" ");
    render(workbench);
    return;
  }

  if (action === "open-generation-menu") {
    workbench.ui.isGenerationConsoleCollapsed = !workbench.ui.isGenerationConsoleCollapsed;
    workbench.ui.isVideoModelMenuOpen = false;
    workbench.ui.openGenerationSelectMenu = null;
    workbench.ui.isFirstFrameMenuOpen = false;
    workbench.ui.activeGenerationFrameMenu = null;
    workbench.ui.referenceAssetPickerKind = null;
    render(workbench);
    return;
  }

  if (action === "attach-shot-reference") {
    const selectedStoryboard = getSelectedStoryboard(
      getActiveStoryboards(workbench),
      workbench.ui.selectedStoryboardId,
    );
    const role = target.dataset.referenceRole ?? "reference_image";
    const asset = findAssetForReference(workbench, role);
    if (!selectedStoryboard?.linkedShotId) {
      updateStoryboardGenerationState(workbench, selectedStoryboard?.id ?? "", (state) => ({
        ...state,
        localReferenceRoles: toggleSelection(state.localReferenceRoles ?? [], role),
      }));
      workbench.ui.toast = "Reference role staged locally for this storyboard.";
      render(workbench);
      return;
    }
    if (!asset?.id) {
      updateStoryboardGenerationState(workbench, selectedStoryboard.id, (state) => ({
        ...state,
        localReferenceRoles: toggleSelection(state.localReferenceRoles ?? [], role),
      }));
      workbench.ui.toast = "Please import a matching asset first.";
      render(workbench);
      return;
    }
    const existing = (selectedStoryboard.references ?? []).filter(
      (item) => !(item.role === role && item.assetId === asset.id),
    );
    await runAction(workbench, "婵犵數濮甸鏍窗濡ゅ啯宕查柟閭﹀枛缁躲倝鏌﹀Ο渚闁肩増瀵ч妵鍕疀閹炬惌妫ょ紒鐐劤閵堟悂寮婚悢琛″亾濞戞瑯鐒界紒鐘筹耿閺岋繝宕遍弴鐐茬ギ闂佸搫鏈惄顖炵嵁閹烘绠ｉ柣鎴濇閿涘棝姊绘担鍛婃儓婵☆偅顨婇獮濠囧箛椤戔晪缍侀獮鍥偋閸繀姹楅梻浣瑰劤濞存岸宕戦崱娆戠煓?..", async () => {
      await workbench.api.replaceShotReferences(selectedStoryboard.linkedShotId, {
        items: [
          ...existing.map((item, index) => ({
            role: item.role,
            assetId: item.assetId,
            assetVersionId: item.assetVersionId ?? null,
            sortOrder: index,
          })),
          {
            role,
            assetId: asset.id,
            assetVersionId: asset.latestVersion?.id ?? null,
            sortOrder: existing.length,
          },
        ],
      });
    });
    return;
  }

  if (action === "cancel-local-video-upload") {
    cancelStoryboardVideoUpload(workbench, target.dataset.storyboardId ?? "", target.dataset.videoId ?? "");
    render(workbench);
    return;
  }

  if (action === "select-uploaded-video") {
    const videoId = target.dataset.videoId ?? "";
    const storyboardId = target.dataset.storyboardId ?? "";
    if (!videoId) {
      return;
    }
    await selectStoryboardUploadedVideo(workbench, storyboardId, videoId);
    return;
  }

  if (action === "clear-selected-uploaded-video") {
    await clearStoryboardUploadedVideoSelection(workbench, target.dataset.storyboardId ?? "");
    return;
  }

  if (
    action === "storyboard-video-subtitle-clean" ||
    action === "storyboard-video-upscale" ||
    action === "storyboard-video-frame" ||
    action === "storyboard-video-more" ||
    action === "storyboard-video-info"
  ) {
    applyStoryboardVideoToolAction(
      workbench,
      action,
      target.dataset.storyboardId ?? "",
      target.dataset.videoId ?? "",
    );
    render(workbench);
    return;
  }

  if (action === "delete-storyboard-video") {
    const storyboardId = target.dataset.storyboardId ?? "";
    const videoId = target.dataset.videoId ?? "";
    const storyboard = getActiveStoryboards(workbench).find((item) => item.id === storyboardId);
    if (!storyboardId || !videoId || !(storyboard?.uploadedVideos ?? []).some((item) => item.id === videoId)) {
      workbench.ui.toast = "?????????";
      render(workbench);
      return;
    }
    workbench.ui.storyboardVideoDeleteTarget = {
      storyboardId,
      videoId,
    };
    render(workbench);
    return;
  }

  if (
    action === "storyboard-image-to-video" ||
    action === "storyboard-image-edit" ||
    action === "storyboard-image-multi-view" ||
    action === "storyboard-image-crop" ||
    action === "storyboard-image-info"
  ) {
    applyStoryboardImageToolAction(workbench, action, target.dataset.storyboardId ?? "");
    render(workbench);
    return;
  }

  if (action === "delete-storyboard-image") {
    workbench.ui.storyboardImageDeleteTarget = {
      storyboardId: target.dataset.storyboardId ?? "",
      imageId: target.dataset.imageId ?? "",
    };
    render(workbench);
    return;
  }

  if (
    action === "storyboard-video-subtitle-clean" ||
    action === "storyboard-video-upscale" ||
    action === "storyboard-video-frame" ||
    action === "storyboard-video-more" ||
    action === "storyboard-video-info"
  ) {
    const actionLabel =
      {
        "storyboard-video-subtitle-clean": "去字幕",
        "storyboard-video-upscale": "超清处理",
        "storyboard-video-frame": "首尾帧",
        "storyboard-video-more": "更多操作",
        "storyboard-video-info": "查看详情",
      }[action] ?? "视频操作";
    workbench.ui.toast = `${actionLabel}功能已同步到右侧操作面板。`;
    render(workbench);
    return;
  }

  if (action === "download-storyboard-video") {
    downloadStoryboardVideo(
      workbench,
      target.dataset.storyboardId ?? "",
      target.dataset.videoId ?? "",
    );
    render(workbench);
    return;
  }

  if (
    action === "storyboard-image-to-video" ||
    action === "storyboard-image-edit" ||
    action === "storyboard-image-multi-view" ||
    action === "storyboard-image-crop" ||
    action === "storyboard-image-info"
  ) {
    const actionLabel =
      {
        "storyboard-image-to-video": "图片转视频",
        "storyboard-image-edit": "文字改图",
        "storyboard-image-multi-view": "多视图",
        "storyboard-image-crop": "裁切",
        "storyboard-image-info": "查看详情",
      }[action] ?? "图片操作";
    workbench.ui.toast = `${actionLabel}功能已同步到右侧操作面板。`;
    render(workbench);
    return;
  }

  if (action === "download-storyboard-image") {
    downloadStoryboardImage(workbench, target.dataset.storyboardId ?? "", target.dataset.imageId ?? "");
    render(workbench);
    return;
  }

  if (action === "rename-project-card") {
    const projectId = target.dataset.projectId ?? null;
    const currentProject = workbench.ui.projectLibrary.find((project) => project.id === projectId);
    workbench.ui.renameProjectId = projectId;
    workbench.ui.renameProjectName = currentProject?.name ?? "";
    workbench.ui.renameProjectNotice = "";
    workbench.ui.projectCardMenuId = null;
    render(workbench);
    return;
  }

  if (action === "close-rename-project-modal") {
    workbench.ui.renameProjectId = null;
    workbench.ui.renameProjectName = "";
    workbench.ui.renameProjectNotice = "";
    render(workbench);
    return;
  }

  if (action === "confirm-rename-project-card") {
    const projectId = workbench.ui.renameProjectId;
    const nextName = workbench.ui.renameProjectName.trim();
    if (!nextName) {
      workbench.ui.renameProjectNotice = "Please enter a project name.";
      render(workbench);
      return;
    }
    await runAction(workbench, "濠电姵顔栭崰妤冩崲閹邦喖绶ら柦妯侯檧閼版寧銇勮箛鎾跺闁绘挸鍊婚埀顒€绠嶉崕閬嶅箠韫囨稑鍚归柟鐑橆殕閻撴洘鎱ㄥ鍡楀閺佸牓姊洪棃娑欘棞缂佸缍婇獮?..", async () => {
      await workbench.api.updateProject({
        projectId,
        name: nextName,
      });
      workbench.ui.renameProjectId = null;
      workbench.ui.renameProjectName = "";
      workbench.ui.renameProjectNotice = "";
    });
    return;
  }

  if (action === "delete-project-card") {
    workbench.ui.deleteProjectId = target.dataset.projectId ?? null;
    workbench.ui.projectCardMenuId = null;
    render(workbench);
    return;
  }

  if (action === "close-delete-project-modal") {
    workbench.ui.deleteProjectId = null;
    render(workbench);
    return;
  }

  if (action === "confirm-delete-project-card") {
    const projectId = workbench.ui.deleteProjectId;
    await runAction(workbench, "濠电姵顔栭崰妤冩崲閹邦喖绶ら柦妯侯檧閼版寧銇勮箛鎾跺缂佲偓閸℃稒鐓熸俊顖濆亹鐢盯鏌ｅ┑鍫濇瀻妞ゎ亜鍟存俊鍫曞川椤旇法顢呮繝?..", async () => {
      await workbench.api.deleteProject({ projectId });
      workbench.ui.deleteProjectId = null;
      if (workbench.ui.selectedProjectCardId === projectId) {
        workbench.ui.selectedProjectCardId = null;
        workbench.ui.projectPanelMode = "library";
      }
    });
    return;
  }

  if (action === "add-storyboard") {
    const episodeId =
      workbench.ui.projectPanelMode === "episode-workbench"
        ? workbench.ui.selectedEpisodeId ?? "episode-primary"
        : "episode-primary";
    if (workbench.state?.project?.id) {
      await runAction(workbench, "婵犵數濮甸鏍窗濡ゅ啯宕查柟閭﹀枛缁躲倝鏌﹀Ο渚闁肩増瀵ч妵鍕疀閹捐泛顣哄┑鈽嗗亝閿曘垽寮婚埄鍐ㄧ窞閻庯綁娼ч崝宀勬⒑閸濆嫷妲告い顓犲厴瀵鈽夐姀鐘殿唺闂佺懓顕崕鎰涢敃鍌涒拺?..", async () => {
        const existing = getEpisodeStoryboards(workbench, episodeId);
        const nextIndex = existing.length + 1;
        const result = await workbench.api.createShot({
          episodeId: episodeId === "episode-primary" ? null : episodeId,
          title: String(nextIndex),
          description: "",
        });
        const nextStoryboards = addStoryboard(existing);
        const addedStoryboard = nextStoryboards.at(-1);
        if (addedStoryboard) {
          const nextStoryboard = {
            ...addedStoryboard,
            id: result.shot?.id ? `storyboard-${result.shot.id}` : addedStoryboard.id,
            linkedShotId: result.shot?.id ?? addedStoryboard.linkedShotId ?? null,
          };
          replaceActiveStoryboards(workbench, [...nextStoryboards.slice(0, -1), nextStoryboard]);
          workbench.ui.selectedStoryboardId = nextStoryboard.id;
          persistWorkbenchState(workbench);
        }
      });
      return;
    }
    const nextStoryboards = addStoryboard(getEpisodeStoryboards(workbench, episodeId));
    workbench.ui.storyboards =
      episodeId === "episode-primary" ? nextStoryboards : workbench.ui.storyboards;
    workbench.ui.episodeStoryboardMap = {
      ...workbench.ui.episodeStoryboardMap,
      [episodeId]: nextStoryboards,
    };
    workbench.ui.selectedStoryboardId = nextStoryboards.at(-1)?.id ?? null;
    workbench.ui.toast = "Added a new storyboard.";
    render(workbench);
    return;
  }

  if (action === "skip-calibration" || action === "override-calibration") {
    const isSkip = action === "skip-calibration";
    const reason = (isSkip
      ? workbench.ui.calibrationSkipReason
      : workbench.ui.calibrationOverrideReason
    ).trim();
    if (!reason) {
      workbench.ui.validationMessage = isSkip
        ? "Please enter a reason for skipping calibration."
        : "Please enter a reason for overriding calibration.";
      workbench.ui.toast = workbench.ui.validationMessage;
      render(workbench);
      return;
    }
    await runAction(
      workbench,
      isSkip ? "婵犵數濮甸鏍窗濡ゅ啯宕查柟閭﹀枛缁躲倝鏌﹀Ο渚闁肩増瀵ч妵鍕疀閹炬惌妫￠悗瑙勬礀椤︾敻骞冨Δ鍛嵍妞ゆ挾鍊妷褏纾奸柣妯虹－婢х敻鏌＄仦绯曞亾閹颁礁鎮戞繛杈剧稻瑜板啯绂嶆ィ鍐╃厱闁归偊鍓欑痪褔鏌?.." : "婵犵數濮甸鏍窗濡ゅ啯宕查柟閭﹀枛缁躲倝鏌﹀Ο渚闁肩増瀵ч妵鍕疀閹炬惌妫￠梺鍝ュ枑濡炰粙寮诲☉銏犵労闁告劦浜濋崳顓犵磼閹冪稏闁告濞婂濠氬灳閹颁礁鎮戞繛杈剧稻瑜板啯绂嶆ィ鍐╃厱闁归偊鍓欑痪褔鏌?..",
      async () => {
        workbench.ui.validationMessage = "";
        if (isSkip) {
          await workbench.api.skipCalibration({ reason });
        } else {
          await workbench.api.overrideCalibration({ reason });
        }
      },
    );
    return;
  }

  if (action === "create-project") {
    const name = getInputValue(workbench.root, "#project-create-name-input", "").trim();
    if (!name) {
      workbench.ui.createProjectNotice = "请输入项目名称。";
      render(workbench);
      return;
    }

    const aspectRatio = getCheckedValue(workbench.root, 'input[name="project-aspect-ratio"]', "9:16");
    const projectType = getCheckedValue(workbench.root, 'input[name="project-type"]', "anime");
    if (!aspectRatio) {
      workbench.ui.createProjectNotice = "Please choose an aspect ratio.";
      render(workbench);
      return;
    }
    if (!projectType) {
      workbench.ui.createProjectNotice = "Please choose a project type.";
      render(workbench);
      return;
    }

    await runAction(workbench, statusForAction(action), async () => {
      const created = await workbench.api.createProject(buildProjectCreateRequest({
        name,
        aspectRatio,
        projectType,
      }));
      const createdProject =
        created?.project ??
        created?.body?.project ??
        null;
      if (createdProject?.id) {
        const nextCard = mapProjectRecordToCard(createdProject);
        const projects = Array.isArray(workbench.ui.projectLibrary) ? workbench.ui.projectLibrary : [];
        const existingIndex = projects.findIndex((candidate) => candidate.id === nextCard.id);
        workbench.ui.projectLibrary =
          existingIndex >= 0
            ? projects.map((candidate, index) => (index === existingIndex ? { ...candidate, ...nextCard } : candidate))
            : [nextCard, ...projects];
        workbench.ui.selectedProjectCardId = nextCard.id;
      } else {
        await syncProjectLibraryFromApi(workbench);
      }
      workbench.ui.projectLibraryPage = 1;
      workbench.ui.activeNavTab = "project";
      workbench.ui.projectPanelMode = "library";
      workbench.ui.isCreateModalOpen = false;
      workbench.ui.createProjectNotice = "";
      workbench.ui.createProjectName = name;
      workbench.ui.createAspectRatio = aspectRatio;
      workbench.ui.createProjectType = projectType;
      workbench.ui.isScriptModalOpen = false;
      workbench.ui.uploadNotice = "";
      window.location.hash = "project";
    });
    return;
  }

  await runAction(workbench, statusForAction(action), async () => {
    if (action === "parse-script") {
      await workbench.api.parseScript();
      return;
    }

    if (action === "confirm-all-assets") {
      await workbench.api.confirmAllAssets();
      return;
    }

    if (action === "confirm-asset") {
      await workbench.api.confirmAsset({
        group: target.dataset.group,
        assetKey: target.dataset.assetKey,
      });
      return;
    }

    if (action === "edit-asset") {
    const nextLabel = window.prompt("?????????", target.dataset.label ?? "");
      if (!nextLabel || nextLabel.trim() === target.dataset.label) {
        return;
      }
      await workbench.api.updateAssetLabel({
        group: target.dataset.group,
        assetKey: target.dataset.assetKey,
        label: nextLabel,
      });
      return;
    }

  if (action === "run-calibration") {
    const result = await workbench.api.runCalibration();
    workbench.ui.lastCalibrationResult = result;
    return;
  }

  if (action === "generate-images") {
    await generateStoryboardImages(workbench);
    return;
  }

    if (action === "generate-videos") {
      const validation = validateVideoGeneration({
        firstFrameUploaded: hasFirstFrame(workbench),
      });
      if (!validation.ok) {
        workbench.ui.validationMessage = validation.message;
        workbench.ui.toast = validation.message;
        render(workbench);
        return;
      }
      workbench.ui.validationMessage = "";
      await generateStoryboardVideos(workbench);
      return;
    }

    if (action === "smart-generate") {
      const validation = validateVideoGeneration({
        firstFrameUploaded: hasFirstFrame(workbench),
      });
      if (!validation.ok) {
        workbench.ui.validationMessage = validation.message;
        workbench.ui.toast = validation.message;
        render(workbench);
        return;
      }
      workbench.ui.validationMessage = "";
      await runSmartGenerate(workbench);
      return;
    }

    if (action === "preview-export") {
      collectEpisodeWorkbenchEvent(workbench, "export.preview", {
        projectId: workbench.state?.project?.id ?? workbench.ui.selectedProjectCardId ?? null,
        episodeId: workbench.ui.selectedEpisodeId ?? null,
        storyboardCount: getActiveStoryboards(workbench).length,
      });
      workbench.ui.exportPreviewResult = await createEpisodeExportPreview(workbench);
    }
  });
}

async function runSmartGenerate(workbench) {
  await ensureGenerationReady(workbench);
  if (workbench.state.shots.some((shot) => !shot.currentImageAssetVersionId)) {
    workbench.ui.imageGenerationResult = await workbench.api.generateImages();
  }
  const afterImages = await workbench.api.getCreatorState();
  if (afterImages.shots.some((shot) => !shot.currentImageAssetVersionId)) {
    throw new Error("image_assets_missing");
  }
  if (afterImages.shots.some((shot) => !shot.currentVideoAssetVersionId)) {
    workbench.ui.videoGenerationResult = await workbench.api.generateVideos();
  }
}

async function ensureGenerationReady(workbench) {
  if (!workbench.state?.project) {
    throw new Error("creator_project_missing");
  }
  if (!workbench.state.shots.length) {
    throw new Error("creator_shots_missing");
  }
  if (!workbench.state.assetReview?.readyForGeneration) {
    throw new Error("asset_review_not_ready");
  }
  if (!workbench.state.calibration) {
    workbench.ui.lastCalibrationResult = await workbench.api.runCalibration();
    await refresh(workbench);
  }
}

async function runAction(workbench, message, action) {
  workbench.ui.busy = true;
  workbench.ui.toast = message;
  render(workbench);

  try {
    await action();
    workbench.ui.toast = "操作已完成。";
  } catch (error) {
    workbench.ui.toast = `操作失败：${friendlyError(error)}`;
  } finally {
    workbench.ui.busy = false;
    render(workbench);
  }
}

function openSingleEpisodeFlow(workbench) {
  workbench.ui.projectInteriorSection = "episodes";
  workbench.ui.isSingleEpisodeModalOpen = true;
  workbench.ui.isScriptModalOpen = false;
  workbench.ui.singleEpisodeName = "";
  workbench.ui.singleEpisodeScript = "";
  workbench.ui.singleEpisodeAspectRatio = "9:16";
  workbench.ui.singleEpisodeModel = "seedance-2.0";
  workbench.ui.singleEpisodeNotice = "";
  workbench.ui.uploadNotice = "";
  render(workbench);
}

async function createSingleEpisodeAndEnterWorkbench(workbench, title, options = {}) {
  const runCreation = async () => {
    const projectId = workbench.ui.selectedProjectCardId ?? workbench.state?.project?.id ?? null;
    const created =
      projectId && typeof workbench.api.createProjectEpisode === "function"
        ? await workbench.api.createProjectEpisode(projectId, { title })
        : await workbench.api.createEpisode({
            projectId,
            title,
          });
    if (workbench.ui.selectedProjectCardId) {
      applyProjectDetail(
        workbench,
        await loadProjectDetailForWorkbench(workbench, workbench.ui.selectedProjectCardId),
      );
    }

    const createdEpisodeId =
      created?.episode?.id ??
      created?.episode?.episodeId ??
      created?.body?.episode?.id ??
      created?.body?.episode?.episodeId ??
      null;
    resetSingleEpisodeModalState(workbench);
    workbench.ui.episodeCardMenuId = null;
    await enterEpisodeWorkbench(workbench, createdEpisodeId ?? getDefaultEpisodeWorkbenchId(workbench), {
      toast: "Entered the episode workspace.",
      shouldRender: false,
    });
  };

  if (options.skipRunAction) {
    await runCreation();
    return;
  }

  await runAction(workbench, "Creating episode...", runCreation);
}

function resetSingleEpisodeModalState(workbench) {
  workbench.ui.isSingleEpisodeModalOpen = false;
  workbench.ui.singleEpisodeName = "";
  workbench.ui.singleEpisodeScript = "";
  workbench.ui.singleEpisodeAspectRatio = "9:16";
  workbench.ui.singleEpisodeModel = "seedance-2.0";
  workbench.ui.singleEpisodeNotice = "";
}

async function enterEpisodeWorkbench(workbench, episodeId, options = {}) {
  const availableEpisodes = getDetailEpisodes(workbench.state);
  const hasRealEpisodes = availableEpisodes.some((episode) => episode?.id && episode.id !== "episode-primary");
  const canUsePrimaryFallback =
    !hasRealEpisodes && availableEpisodes.some((episode) => episode?.id === "episode-primary");
  const resolvedEpisodeId = episodeId ?? (canUsePrimaryFallback ? "episode-primary" : null);
  let storyboards = getEpisodeStoryboards(workbench, resolvedEpisodeId);
  workbench.ui.episodeWorkbenchError = "";

  if (
    resolvedEpisodeId &&
    resolvedEpisodeId !== "episode-primary" &&
    typeof workbench.api.getEpisodeWorkbench === "function"
  ) {
    try {
      const context = await workbench.api.getEpisodeWorkbench(resolvedEpisodeId);
      workbench.ui.episodeWorkbenchContext = context;
      workbench.ui.selectedProjectCardId =
        context?.project?.projectId ?? context?.episode?.projectId ?? workbench.ui.selectedProjectCardId;
      await loadEpisodeAssetsForWorkbench(workbench, resolvedEpisodeId);
      await loadEpisodeGenerationConfig(workbench, resolvedEpisodeId);
      storyboards = await loadEpisodeStoryboardsForWorkbench(workbench, resolvedEpisodeId);
    } catch (error) {
      workbench.ui.episodeWorkbenchContext = null;
      workbench.ui.episodeWorkbenchError = friendlyError(error);
      if (!storyboards.length) {
        storyboards = ensureEpisodeStoryboards(workbench, resolvedEpisodeId);
      }
    }
  } else if (resolvedEpisodeId && !storyboards.length) {
    storyboards = ensureEpisodeStoryboards(workbench, resolvedEpisodeId);
  }

  if (!resolvedEpisodeId) {
    workbench.ui.episodeWorkbenchContext = null;
    workbench.ui.selectedEpisodeId = null;
    workbench.ui.projectPanelMode = "workspace";
    workbench.ui.toast = "当前没有可进入的剧集工作台。";
    workbench.ui.toast = "当前没有可进入的剧集工作台。";
    if (options.shouldRender !== false) {
      render(workbench);
    }
    return;
  }

  workbench.ui.selectedEpisodeId = resolvedEpisodeId;
  workbench.ui.activeNavTab = "project";
  workbench.ui.projectPanelMode = "episode-workbench";
  workbench.ui.projectInteriorSection = "episodes";
  workbench.ui.projectInteriorStatusMenuOpen = false;
  workbench.ui.episodeCardMenuId = null;
  workbench.ui.selectedStoryboardId = storyboards[0]?.id ?? null;
  workbench.ui.museScopeMode = options.scopeMode ?? "storyboard";
  if (options.toast) {
    workbench.ui.toast = options.toast;
  } else if (workbench.ui.episodeWorkbenchError) {
    workbench.ui.toast = `鍓ч泦宸ヤ綔鍙板姞杞藉け璐ワ細${workbench.ui.episodeWorkbenchError}`;
  }
  if (!options.preserveRoute) {
    const projectId =
      workbench.ui.selectedProjectCardId ??
      workbench.state?.project?.id ??
      workbench.ui.episodeWorkbenchContext?.project?.projectId ??
      workbench.ui.episodeWorkbenchContext?.episode?.projectId ??
      null;
    window.location.hash =
      projectId && resolvedEpisodeId && resolvedEpisodeId !== "episode-primary"
        ? `projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(resolvedEpisodeId)}`
        : "episode-workbench";
  }
  if (options.shouldRender !== false) {
    render(workbench);
  }
}

async function loadEpisodeStoryboardsForWorkbench(workbench, episodeId) {
  if (typeof workbench.api.listStoryboards !== "function") {
    return ensureEpisodeStoryboards(workbench, episodeId);
  }
  const page = await workbench.api.listStoryboards(episodeId, { page: 1, pageSize: 200 });
  const items = Array.isArray(page?.items) ? page.items : [];
  const mappedStoryboards = items.map(mapEpisodeStoryboardContract);
  workbench.ui.episodeStoryboardMap = {
    ...workbench.ui.episodeStoryboardMap,
    [episodeId]: mappedStoryboards,
  };
  return mappedStoryboards;
}

async function loadEpisodeAssetsForWorkbench(workbench, episodeId) {
  if (typeof workbench.api.listEpisodeAssets !== "function") {
    return workbench.ui.importedAssets;
  }
  const [characterPage, scenePage, propPage] = await Promise.all([
    workbench.api.listEpisodeAssets(episodeId, { assetType: "role", page: 1, pageSize: 200 }),
    workbench.api.listEpisodeAssets(episodeId, { assetType: "scene", page: 1, pageSize: 200 }),
    workbench.api.listEpisodeAssets(episodeId, { assetType: "prop", page: 1, pageSize: 200 }),
  ]);
  workbench.ui.importedAssets = {
    ...(workbench.ui.importedAssets ?? {
      character: [],
      scene: [],
      prop: [],
      other: { image: [], video: [] },
    }),
    character: mapEpisodeAssetContracts(characterPage?.items, "character"),
    scene: mapEpisodeAssetContracts(scenePage?.items, "scene"),
    prop: mapEpisodeAssetContracts(propPage?.items, "prop"),
  };
  return workbench.ui.importedAssets;
}

async function loadEpisodeGenerationConfig(workbench, episodeId) {
  if (typeof workbench.api.listGenerationConfig !== "function") {
    workbench.ui.episodeGenerationConfig = {
      uploadLimits: defaultUploadLimits,
    };
    return workbench.ui.episodeGenerationConfig;
  }
  const config = await workbench.api.listGenerationConfig(episodeId);
  workbench.ui.episodeGenerationConfig = {
    ...config,
    uploadLimits: config?.uploadLimits ?? defaultUploadLimits,
  };
  return workbench.ui.episodeGenerationConfig;
}

function getEpisodeUploadLimits(workbench) {
  return workbench.ui.episodeGenerationConfig?.uploadLimits ?? defaultUploadLimits;
}

function getProjectCoverUploadLimits() {
  return {
    ...defaultUploadLimits,
    video: undefined,
    audio: undefined,
  };
}

function openBatchEpisodeFlow(workbench) {
  workbench.ui.projectInteriorSection = "episodes";
  workbench.ui.isSingleEpisodeModalOpen = false;
  workbench.ui.isScriptModalOpen = true;
  workbench.ui.scriptTab = "script-upload";
  workbench.ui.scriptSubmitAction = "confirm-batch-episode";
  workbench.ui.scriptSubmitLabel = "绾喛顓婚幍褰掑櫤閸掓稑缂撻崚鍡涙肠";
  workbench.ui.singleEpisodeNotice = "";
  workbench.ui.uploadNotice = "";
  render(workbench);
}

function hasFirstFrame(workbench) {
  const selectedStoryboard = getSelectedStoryboard(
    getActiveStoryboards(workbench),
    workbench.ui.selectedStoryboardId,
  );
  if (selectedStoryboard?.imageStatus === "ready") {
    return true;
  }
  return workbench.state?.shots?.some((shot) => shot.currentImageAssetVersionId) ?? false;
}

async function uploadLocalFile(workbench, file, category, options = {}) {
  console.log("[project-cover] uploadLocalFile:start", {
    category,
    fileName: file?.name ?? null,
    size: file?.size ?? null,
    type: file?.type ?? null,
    projectId:
      options.projectId ?? workbench.state?.project?.id ?? workbench.ui.selectedProjectCardId ?? null,
  });
  const result = await workbench.api.uploadFile(file, {
    category,
    projectId:
      options.projectId ?? workbench.state?.project?.id ?? workbench.ui.selectedProjectCardId ?? null,
    onProgress: options.onProgress,
    signal: options.signal,
    uploadLimits: options.uploadLimits ?? getEpisodeUploadLimits(workbench),
  });
  if (!result?.upload) {
    throw new Error("upload_result_missing");
  }
  console.log("[project-cover] uploadLocalFile:done", {
    category,
    uploadSessionId: result.upload.uploadSessionId ?? null,
    storageObjectId: result.upload.storageObjectId ?? null,
    previewUrl: result.upload.previewUrl ?? null,
  });
  return result.upload;
}

export async function uploadProjectCoverFile(workbench, file, projectId) {
  console.log("[project-cover] uploadProjectCoverFile:start", {
    projectId,
    fileName: file?.name ?? null,
  });
  const upload = await uploadLocalFile(workbench, file, "project-covers", {
    projectId,
    uploadLimits: getProjectCoverUploadLimits(),
  });
  const result = await workbench.api.updateProjectCover({
    projectId,
    uploadSessionId: upload.uploadSessionId,
    storageObjectId: upload.storageObjectId,
  });
  console.log("[project-cover] uploadProjectCoverFile:updateProjectCover", result?.project ?? null);
  mergeProjectCoverUpdate(workbench, result?.project);
  return result;
}

function mergeProjectCoverUpdate(workbench, project) {
  if (!project?.id) {
    return;
  }

  const nextCard = mapProjectRecordToCard(project);
  const projects = Array.isArray(workbench.ui?.projectLibrary)
    ? workbench.ui.projectLibrary
    : [];
  const existingIndex = projects.findIndex((candidate) => candidate.id === nextCard.id);
  workbench.ui.projectLibrary =
    existingIndex >= 0
      ? projects.map((candidate, index) =>
          index === existingIndex ? { ...candidate, ...nextCard } : candidate,
        )
      : [nextCard, ...projects];

  if (workbench.state?.project?.id === project.id) {
    workbench.state.project = {
      ...workbench.state.project,
      coverImageUrl: project.coverImageUrl ?? workbench.state.project.coverImageUrl ?? "",
      coverStorageObjectId:
        project.coverStorageObjectId ?? workbench.state.project.coverStorageObjectId ?? null,
      updatedAt: project.updatedAt ?? workbench.state.project.updatedAt,
    };
  }
}

async function bindEpisodeUploadIfAvailable(workbench, upload, input = {}) {
  if (
    !isRealEpisodeWorkbench(workbench) ||
    typeof workbench.api.bindFileResource !== "function" ||
    !upload?.uploadSessionId ||
    !upload?.storageObjectId
  ) {
    return null;
  }
  return workbench.api.bindFileResource(workbench.ui.selectedEpisodeId, {
    uploadSessionId: upload.uploadSessionId,
    storageObjectId: upload.storageObjectId,
    targetType: input.targetType ?? "storyboard",
    targetId: input.targetId ?? "",
    mediaKind:
      input.mediaKind ??
      (String(upload.mimeType ?? "").startsWith("video/")
        ? "video"
        : String(upload.mimeType ?? "").startsWith("audio/")
          ? "audio"
          : "image"),
    width: input.width ?? 1024,
    height: input.height ?? 1024,
    durationMs: input.durationMs ?? null,
  });
}

function datasetToObject(dataset = {}) {
  return Object.fromEntries(Object.entries(dataset));
}

function collectEpisodeWorkbenchEvent(workbench, eventType, payload = {}) {
  if (typeof workbench?.api?.collectEpisodeEvent !== "function") {
    return;
  }

  const activeStoryboards = getActiveStoryboards(workbench);
  const selectedStoryboard = getSelectedStoryboard(
    activeStoryboards,
    workbench.ui.selectedStoryboardId,
  );
  const body = {
    eventType,
    projectId: workbench.state?.project?.id ?? workbench.ui.selectedProjectCardId ?? null,
    episodeId: workbench.ui.selectedEpisodeId ?? null,
    storyboardId: selectedStoryboard?.id ?? workbench.ui.selectedStoryboardId ?? null,
    shotId: selectedStoryboard?.linkedShotId ?? null,
    mediaMode: workbench.ui.episodeMediaMode ?? null,
    model: workbench.ui.selectedModelId ?? null,
    payload,
    clientCreatedAt: new Date().toISOString(),
  };

  void workbench.api.collectEpisodeEvent(body).catch(() => {
    // Interaction collection should never interrupt creator workflows.
  });
}

function applyGenerationFieldChange(workbench, field, value) {
  if (field === "videoDurationSec") {
    workbench.ui.videoDurationSec = value || "5";
    return;
  }
  if (field === "videoResolution") {
    workbench.ui.videoResolution = value || "1080p";
    return;
  }
  if (field === "imageResolution") {
    workbench.ui.imageResolution = value || "2K";
    return;
  }
  if (field === "imageAspectRatio") {
    workbench.ui.imageAspectRatio = value || "16:9";
  }
}

function clampCount(value, minimum, maximum) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return minimum;
  }
  return Math.min(maximum, Math.max(minimum, Math.round(numeric)));
}

function buildSuggestedPrompt(selectedStoryboard, ui) {
  const base = (selectedStoryboard?.description || selectedStoryboard?.title || "").trim();
  if (ui?.episodeMediaMode === "video") {
    return `${base || "Describe the shot content"}, keep the comic style consistent, motion smooth, and expressions natural.`;
  }
  return `${base || "Describe the frame content"}, keep character consistency and strong composition with layered lighting.`;
}

async function handleGenerationUploadFiles(workbench, uploadTarget, files) {
  const storyboardId = workbench.ui.selectedStoryboardId ?? null;
  if (!storyboardId) {
    workbench.ui.toast = "Please select a storyboard first.";
    render(workbench);
    return;
  }

  if (uploadTarget === "first-frame-image") {
    const firstImage = files.find((file) => String(file.type || "").startsWith("image/"));
    if (!firstImage) {
      workbench.ui.toast = "Please upload an image file.";
      render(workbench);
      return;
    }
    await handleLocalStoryboardImageFile(workbench, storyboardId, firstImage);
    syncGenerationStateFromStoryboardImage(workbench, storyboardId);
    render(workbench);
    return;
  }

  if (uploadTarget === "last-frame-image") {
    const lastFrameImage = files.find((file) => String(file.type || "").startsWith("image/"));
    if (!lastFrameImage) {
      workbench.ui.toast = "Please upload an image file.";
      render(workbench);
      return;
    }
    await handleGenerationAssetUpload(workbench, storyboardId, "lastFrame", lastFrameImage, "generation-frames");
    return;
  }

  if (uploadTarget === "image-reference") {
    const imageReference = files.find((file) => String(file.type || "").startsWith("image/"));
    if (!imageReference) {
      workbench.ui.toast = "Please upload an image file.";
      render(workbench);
      return;
    }
    await handleGenerationAssetUpload(
      workbench,
      storyboardId,
      "imageReference",
      imageReference,
      "generation-references",
    );
    return;
  }

  if (uploadTarget === "edit-source-video") {
    const sourceVideo = files.find((file) => String(file.type || "").startsWith("video/"));
    if (!sourceVideo) {
      workbench.ui.toast = "Please upload a video file.";
      render(workbench);
      return;
    }
    await handleGenerationAssetUpload(workbench, storyboardId, "editSourceVideo", sourceVideo, "storyboard-videos");
    return;
  }

  await handleGenerationReferenceFiles(workbench, storyboardId, files);
}

async function handleGenerationReferenceFiles(workbench, storyboardId, files) {
  const selectedStoryboard = getSelectedStoryboard(
    getActiveStoryboards(workbench),
    workbench.ui.selectedStoryboardId,
  );
  const importableFiles = files.filter((file) =>
    String(file.type || "").startsWith("image/") || String(file.type || "").startsWith("video/"),
  );
  if (!importableFiles.length) {
    workbench.ui.toast = "Only image and video reference uploads are supported here.";
    render(workbench);
    return;
  }

  await runAction(workbench, "濠电姵顔栭崰妤冩崲閹邦喖绶ら柦妯侯檧閼版寧銇勮箛鎾村櫧闁崇粯鏌ㄩ埞鎴︽偐鏉堫偄鍘￠梺缁樺姇閿曨亪寮诲☉妯锋瀻闊洦鎸撮崑鎾寸鐎ｎ亞鍔﹀銈嗗坊閸嬫捇鏌涢悢绋款棆缂侇喖鐗嗛悾婵嬪礋椤愩倝鐛?..", async () => {
    const createdReferences = [];
    const uploadedDrafts = [];
    for (const file of importableFiles) {
      const mediaKind = String(file.type || "").startsWith("video/") ? "video" : "image";
      const upload = await uploadLocalFile(workbench, file, "generation-references");
      const resolvedUrl = resolveApiUrl(upload.publicUrl);
      const bound = await bindEpisodeUploadIfAvailable(workbench, upload, {
        targetType: "storyboard",
        targetId: storyboardId,
        mediaKind,
        width: 1024,
        height: 1024,
      });
      const imported = bound
        ? null
        : await workbench.api.importAsset({
            kind: mediaKind,
            name: normalizeAssetImportName(file.name),
            uploadSessionId: upload.uploadSessionId,
            storageObjectId: upload.storageObjectId,
            mimeType: upload.mimeType,
            width: 1024,
            height: 1024,
          });
      uploadedDrafts.push({
        id: bound?.fileResource?.assetVersionId ?? imported?.asset?.id ?? `reference-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        kind: mediaKind,
        url: resolveApiUrl(bound?.file?.previewUrl ?? resolvedUrl),
        assetId: bound?.fileResource?.assetId ?? imported?.asset?.id ?? null,
        assetVersionId: bound?.fileResource?.assetVersionId ?? imported?.version?.id ?? null,
        storageObjectId: bound?.fileResource?.storageObjectId ?? upload.storageObjectId ?? null,
      });
      const referenceAssetId = bound?.fileResource?.assetId ?? imported?.asset?.id ?? null;
      const referenceVersionId = bound?.fileResource?.assetVersionId ?? imported?.version?.id ?? null;
      if (mediaKind === "image" && referenceAssetId && referenceVersionId) {
        createdReferences.push({
          role: "reference_image",
          assetId: referenceAssetId,
          assetVersionId: referenceVersionId,
        });
      }
    }

    if (selectedStoryboard?.linkedShotId && createdReferences.length) {
      const existing = selectedStoryboard.references ?? [];
      await workbench.api.replaceShotReferences(selectedStoryboard.linkedShotId, {
        items: [
          ...existing.map((item, index) => ({
            role: item.role,
            assetId: item.assetId,
            assetVersionId: item.assetVersionId ?? null,
            sortOrder: index,
          })),
          ...createdReferences.map((item, index) => ({
            ...item,
            sortOrder: existing.length + index,
          })),
        ],
      });
    }

    updateStoryboardGenerationState(workbench, storyboardId, (state) => ({
      ...state,
      referenceUploads: uploadedDrafts,
    }));
  });
}

async function handleGenerationAssetUpload(workbench, storyboardId, stateKey, file, category) {
  updateStoryboardGenerationState(workbench, storyboardId, (state) => ({
    ...state,
    [stateKey]: {
      ...(state?.[stateKey] ?? {}),
      name: file.name,
      kind: String(file.type || "").startsWith("video/") ? "video" : "image",
      status: "uploading",
      summary: "濠电偞鍨堕幐鎼佹晝閿濆洦顫曢柤鍝ユ暩閳?..",
      url: state?.[stateKey]?.url ?? "",
    },
  }));
  render(workbench);

  try {
    const upload = await uploadLocalFile(workbench, file, category, {
      onProgress(progress) {
        const percent = Math.max(0, Math.min(100, Math.round((progress?.progress ?? 0) * 100)));
        updateStoryboardGenerationState(workbench, storyboardId, (state) => ({
          ...state,
          [stateKey]: {
            ...(state?.[stateKey] ?? {}),
            name: file.name,
            kind: String(file.type || "").startsWith("video/") ? "video" : "image",
            status: "uploading",
            summary: `Uploading ${percent}%`,
            url: state?.[stateKey]?.url ?? "",
          },
        }));
        render(workbench);
      },
    });
    updateStoryboardGenerationState(workbench, storyboardId, (state) => ({
      ...state,
      [stateKey]: {
        name: file.name,
        kind: String(file.type || "").startsWith("video/") ? "video" : "image",
        status: "ready",
        summary: stateKey === "editSourceVideo" ? "??????????????" : "??????????????",
        url: resolveApiUrl(upload.publicUrl),
        storageObjectKey: upload.storageObjectKey,
        storageObjectId: upload.storageObjectId ?? null,
        uploadSessionId: upload.uploadSessionId ?? null,
      },
    }));
    workbench.ui.toast = `${file.name} uploaded.`;
  } catch (error) {
    updateStoryboardGenerationState(workbench, storyboardId, (state) => ({
      ...state,
      [stateKey]: null,
    }));
    workbench.ui.toast = `Upload failed: ${friendlyError(error)}`;
  }

  render(workbench);
}

function syncGenerationStateFromStoryboardImage(workbench, storyboardId) {
  const storyboard = getActiveStoryboards(workbench).find((item) => item.id === storyboardId);
  const image = findStoryboardImage(storyboard, imageId);
  if (!image?.src) {
    return;
  }

  updateStoryboardGenerationState(workbench, storyboardId, (state) => ({
    ...state,
    firstFrame: {
      name: storyboard.uploadedImageName || "storyboard-image",
      kind: "image",
      status: "ready",
      summary: "????????????????",
      url: storyboard.previewImageUrl,
    },
  }));
}

function updateStoryboardGenerationState(workbench, storyboardId, updater) {
  if (!storyboardId) {
    return;
  }
  updateStoryboardById(workbench, storyboardId, (storyboard) => ({
    ...storyboard,
    generationState: updater(storyboard.generationState ?? createEmptyGenerationState()),
  }));
}

function resolveEpisodeAssetSelectionContext(workbench) {
  const assetTab = workbench.ui.projectAssetTab ?? "character";
  const importedAssetEntries =
    assetTab === "other"
      ? workbench.ui.importedAssets?.other?.[workbench.ui.projectOtherAssetMediaType ?? "image"] ?? []
      : workbench.ui.importedAssets?.[assetTab] ?? [];
  const fallbackAssetEntries =
    assetTab === "character"
      ? [
          { id: "mock-character-1", name: "废土主角", description: "灰白短发，神情警惕，穿破旧风衣与轻甲。" },
          { id: "mock-character-2", name: "流浪少女", description: "瘦削身形，旧围巾与护目镜，目光倔强。" },
          { id: "mock-character-3", name: "调查员", description: "深色制服配便携终端，站姿克制，表情冷静。" },
          { id: "mock-character-4", name: "机械师", description: "工具腰带和机械义肢，衣着厚重耐磨。" },
          { id: "mock-character-5", name: "守卫", description: "轻型护甲与执勤头盔，动作干练。" },
          { id: "mock-character-6", name: "商贩", description: "背负旧包与零件箱，衣物层次丰富。" },
        ]
      : assetTab === "scene"
        ? [
            { id: "mock-scene-1", name: "废墟街区", description: "断墙残楼、尘雾弥漫、远处霓虹残影。" },
            { id: "mock-scene-2", name: "地下通道", description: "狭长压抑，顶灯闪烁，地面潮湿反光。" },
            { id: "mock-scene-3", name: "临时据点", description: "金属拼接结构，桌面堆满设备和地图。" },
            { id: "mock-scene-4", name: "高楼边缘", description: "俯瞰城市废墟，风大，天色阴沉。" },
          ]
        : [
            { id: "mock-prop-1", name: "通行证", description: "磨损明显，边缘发白，带旧芯片槽。" },
            { id: "mock-prop-2", name: "短刀", description: "刀身轻薄，护手磨损，便于近战。" },
            { id: "mock-prop-3", name: "能量枪", description: "蓝色指示灯常亮，外壳有使用划痕。" },
            { id: "mock-prop-4", name: "通讯器", description: "手持式旧设备，屏幕裂纹但仍可点亮。" },
          ];
  const assetEntries = importedAssetEntries.length ? importedAssetEntries : fallbackAssetEntries;
  const selectedAsset =
    assetEntries.find((item) => item.id === workbench.ui.selectedEpisodeCardId) ??
    assetEntries.find((item) => item.id === workbench.ui.selectedEpisodeAssetId) ??
    assetEntries[0] ??
    null;
  const episodeId = workbench.ui.selectedEpisodeId ?? "episode-primary";
  const episode =
    (workbench.ui.episodes ?? workbench.state?.episodes ?? []).find((item) => item.id === episodeId) ??
    null;
  return {
    episodeId,
    episodeTitle: episode?.title ?? episode?.name ?? null,
    assetTab,
    selectedAssetId: selectedAsset?.id ?? workbench.ui.selectedEpisodeCardId ?? workbench.ui.selectedEpisodeAssetId ?? null,
    selectedAssetName: selectedAsset?.name ?? null,
    selectedAssetDescription: selectedAsset?.description ?? null,
    selectedAssetPreview:
      selectedAsset?.previewUrl ??
      selectedAsset?.preview ??
      selectedAsset?.publicUrl ??
      selectedAsset?.src ??
      null,
    selectedAsset,
  };
}

function resolveEpisodeAssetSelectionContextFromDom(workbench) {
  const root = workbench?.root;
  if (!root) {
    return null;
  }
  const selectedCard = root.querySelector(".episode-replica-asset-card.active");
  if (!selectedCard) {
    return null;
  }

  const selectedAssetId = selectedCard.getAttribute("data-asset-card-id") ?? null;
  const assetTab = selectedCard.getAttribute("data-asset-kind") ?? null;
  const nameNode = selectedCard.querySelector(".episode-replica-asset-select .name");
  const descriptionInput = selectedCard.querySelector(".episode-replica-asset-desc-input");
  const previewImage = selectedCard.querySelector(".preview img");
  const previewMarkup = selectedCard.querySelector(".preview")?.innerHTML?.trim() ?? null;

  return {
    assetTab,
    selectedAssetId,
    selectedAssetName: nameNode?.textContent?.trim() ?? null,
    selectedAssetDescription: descriptionInput?.value?.trim() ?? null,
    selectedAssetPreview: previewImage?.getAttribute("src")?.trim() ?? null,
    selectedAssetPreviewMarkup: previewMarkup,
  };
}

export function buildImageGenerationPayload(workbench) {
  const selectedStoryboard = getSelectedStoryboard(
    getActiveStoryboards(workbench),
    workbench.ui.selectedStoryboardId,
  );
  const isAssetScope = (workbench.ui.museScopeMode ?? "storyboard") === "assets";
  const generationState = isAssetScope
    ? {
        ...createEmptyGenerationState(),
        ...(workbench.ui.assetPromptDraft ?? {}),
      }
    : selectedStoryboard?.generationState ?? createEmptyGenerationState();
  const selectionContext = resolveEpisodeAssetSelectionContext(workbench);
  return {
    shotId: selectedStoryboard?.linkedShotId ?? null,
    promptOverride: workbench.ui.prompt || selectedStoryboard?.description || null,
    model: workbench.ui.selectedModelId,
    parameters: {
      mode: workbench.ui.imageGenerationMode,
      count: clampCount(workbench.ui.imageCount ?? 1, 1, 4),
      resolution: workbench.ui.imageResolution ?? "2K",
      aspectRatio: workbench.ui.imageAspectRatio ?? workbench.state?.project?.aspectRatio ?? "9:16",
      strategy: workbench.ui.multiImageStrategy ?? "spatial-multi-view",
      references: selectedStoryboard?.references ?? [],
      quickReferences: generationState.quickReferenceItems ?? [],
      firstFrame: generationState.firstFrame ?? null,
      imageReference: generationState.imageReference ?? null,
      localReferenceRoles: generationState.localReferenceRoles ?? [],
      selectionContext,
    },
  };
}

export function buildVideoGenerationPayload(workbench) {
  const selectedStoryboard = getSelectedStoryboard(
    getActiveStoryboards(workbench),
    workbench.ui.selectedStoryboardId,
  );
  const generationState = selectedStoryboard?.generationState ?? createEmptyGenerationState();
  return {
    shotId: selectedStoryboard?.linkedShotId ?? null,
    motionPrompt: workbench.ui.prompt || selectedStoryboard?.description || null,
    model: workbench.ui.selectedModelId,
    parameters: {
      mode: workbench.ui.videoGenerationMode,
      count: clampCount(workbench.ui.videoCount ?? 1, 1, 4),
      resolution: workbench.ui.videoResolution ?? workbench.state?.project?.resolution ?? "1080p",
      durationSec: Number(workbench.ui.videoDurationSec ?? 5),
      aspectRatio: workbench.state?.project?.aspectRatio ?? "9:16",
      references: selectedStoryboard?.references ?? [],
      quickReferences: generationState.quickReferenceItems ?? [],
      firstFrame: generationState.firstFrame ?? null,
      lastFrame: generationState.lastFrame ?? null,
      editSourceVideo: generationState.editSourceVideo ?? null,
      referenceUploads: generationState.referenceUploads ?? [],
      imageReference: generationState.imageReference ?? null,
      localReferenceRoles: generationState.localReferenceRoles ?? [],
    },
    audioEnabled: Boolean(workbench.ui.videoAudioEnabled),
    musicEnabled: Boolean(workbench.ui.videoMusicEnabled),
    lipSyncEnabled: Boolean(workbench.ui.videoLipSyncEnabled),
  };
}

export function appendSelectedEpisodeAssetToPrompt(workbench) {
  const selectionContext = resolveEpisodeAssetSelectionContext(workbench);
  const domSelectionContext = resolveEpisodeAssetSelectionContextFromDom(workbench);
  const currentAssetKind = domSelectionContext?.assetTab ?? selectionContext.assetTab;
  const selectedAsset = selectionContext.selectedAsset;
  const selectedAssetId = domSelectionContext?.selectedAssetId ?? selectedAsset?.id ?? null;
  const selectedAssetName =
    domSelectionContext?.selectedAssetName ?? selectionContext.selectedAssetName ?? selectedAsset?.name ?? null;
  const selectedAssetDescription =
    domSelectionContext?.selectedAssetDescription ??
    selectionContext.selectedAssetDescription ??
    selectedAsset?.description ??
    null;
  const selectedAssetPreview =
    domSelectionContext?.selectedAssetPreview ??
    selectionContext.selectedAssetPreview ??
    selectedAsset?.previewUrl ??
    selectedAsset?.preview ??
    selectedAsset?.publicUrl ??
    selectedAsset?.src ??
    null;
  const nextPrompt = String(selectedAssetDescription ?? "").trim();
  if (!nextPrompt) {
    return { ok: false, reason: "missing-asset-prompt", toast: "当前没有可引用素材。" };
  }
  const selectedStoryboard = getSelectedStoryboard(
    getActiveStoryboards(workbench),
    workbench.ui.selectedStoryboardId,
  );
  const nextReference = {
    id: `quick-ref:${currentAssetKind}:${selectedAssetId ?? Date.now()}`,
    assetId: selectedAssetId,
    kind: currentAssetKind,
    name: selectedAssetName ?? "引用素材",
    description: nextPrompt,
    preview: selectedAssetPreview,
    previewMarkup: domSelectionContext?.selectedAssetPreviewMarkup ?? null,
  };
  if (selectedStoryboard) {
    updateStoryboardGenerationState(workbench, selectedStoryboard.id, (generationState) => ({
      ...generationState,
      quickReferenceItems: dedupeQuickReferenceItems([
        ...(generationState.quickReferenceItems ?? []),
        nextReference,
      ]),
    }));
  } else {
    const assetPromptDraft = workbench.ui.assetPromptDraft ?? {};
    workbench.ui.assetPromptDraft = {
      ...assetPromptDraft,
      scopeMode: "assets",
      selectionContext: {
        ...(assetPromptDraft.selectionContext ?? {}),
        ...selectionContext,
      },
      quickReferenceItems: dedupeQuickReferenceItems([
        ...(assetPromptDraft.quickReferenceItems ?? []),
        nextReference,
      ]),
    };
  }

  const promptLine = selectedAssetName ? `${selectedAssetName}: ${nextPrompt}` : nextPrompt;
  const currentPrompt = String(workbench.ui.prompt ?? "").trim();
  workbench.ui.prompt = currentPrompt ? `${currentPrompt}\n${promptLine}` : promptLine;
  workbench.ui.musePromptMenu = null;
  return {
    ok: true,
    prompt: workbench.ui.prompt,
    reference: nextReference,
  };
}

async function generateStoryboardImages(workbench) {
  await ensureGenerationReady(workbench);
  const selectedStoryboard = getSelectedStoryboard(
    getActiveStoryboards(workbench),
    workbench.ui.selectedStoryboardId,
  );
  if (!selectedStoryboard) {
    throw new Error("creator_shots_missing");
  }

  stopGenerationPolling(workbench);
  const submission = createGenerationSubmissionSnapshot(workbench, selectedStoryboard, "image");
  workbench.ui.museScopeMode = "storyboard";
  updateStoryboardGenerationState(workbench, selectedStoryboard.id, (generationState) => ({
    ...generationState,
    lastSubmission: submission,
  }));
  workbench.ui.generationPollingActive = true;
  workbench.ui.busy = true;
    workbench.ui.imageGenerationResult = {
      ...(workbench.ui.imageGenerationResult ?? {}),
      ...submission,
      status: "running",
      quickReferenceItems: submission.quickReferenceItems,
      attachmentItems: submission.attachmentItems,
      selectionContext: submission.selectionContext,
    };
  render(workbench);

  try {
    const payload = buildImageGenerationPayload(workbench);
    collectEpisodeWorkbenchEvent(workbench, "generation.submit", {
      mediaKind: "image",
      payload,
      submission,
    });
    const result = isRealEpisodeWorkbench(workbench) && typeof workbench.api.createImageTask === "function"
      ? normalizeEpisodeTaskForLegacyResult(
          await workbench.api.createImageTask(workbench.ui.selectedEpisodeId, {
            ...payload,
            targetType: "storyboard",
            targetId: selectedStoryboard.linkedShotId ?? selectedStoryboard.id,
            prompt: payload.promptOverride ?? submission.promptPreview,
          }),
          submission,
          "image",
        )
      : await workbench.api.generateImages(payload);
    workbench.ui.imageGenerationResult = {
      ...result,
      ...submission,
      status: resolveWorkflowStatus(result?.platform?.workflowStatus ?? result?.status),
      taskId: result?.platform?.tasks?.[0]?.taskId ?? result?.taskId ?? null,
      quickReferenceItems: submission.quickReferenceItems,
      attachmentItems: submission.attachmentItems,
      fixedImages: result?.fixedImages ?? [],
      selectionContext: result?.selectionContext ?? submission.selectionContext,
    };
    if (isRealEpisodeWorkbench(workbench)) {
      applyEpisodeGenerationTaskResult(workbench, result, selectedStoryboard.id, "image");
    } else {
      await refresh(workbench);
    }
    render(workbench);
    if (shouldContinueGenerationPolling(workbench, selectedStoryboard.id, "image")) {
      scheduleGenerationPolling(workbench, selectedStoryboard.id, "image");
    } else {
      workbench.ui.generationPollingActive = false;
    }
  } catch (error) {
    workbench.ui.generationPollingActive = false;
    updateStoryboardGenerationState(workbench, selectedStoryboard.id, (generationState) => ({
      ...generationState,
      lastSubmission: {
        ...(generationState.lastSubmission ?? submission),
        status: "failed",
      },
    }));
    render(workbench);
    throw error;
  } finally {
    workbench.ui.busy = false;
    render(workbench);
  }
}

async function generateStoryboardVideos(workbench) {
  await ensureGenerationReady(workbench);
  const selectedStoryboard = getSelectedStoryboard(
    getActiveStoryboards(workbench),
    workbench.ui.selectedStoryboardId,
  );
  if (!selectedStoryboard) {
    throw new Error("creator_shots_missing");
  }

  stopGenerationPolling(workbench);
  const submission = createGenerationSubmissionSnapshot(workbench, selectedStoryboard, "video");
  updateStoryboardGenerationState(workbench, selectedStoryboard.id, (generationState) => ({
    ...generationState,
    lastSubmission: submission,
  }));
  workbench.ui.generationPollingActive = true;
  workbench.ui.busy = true;
  workbench.ui.videoGenerationResult = {
    ...(workbench.ui.videoGenerationResult ?? {}),
    ...submission,
    status: "running",
    quickReferenceItems: submission.quickReferenceItems,
  };
  render(workbench);

  try {
    const payload = buildVideoGenerationPayload(workbench);
    collectEpisodeWorkbenchEvent(workbench, "generation.submit", {
      mediaKind: "video",
      payload,
      submission,
    });
    const result = isRealEpisodeWorkbench(workbench) && typeof workbench.api.createVideoTask === "function"
      ? normalizeEpisodeTaskForLegacyResult(
          await workbench.api.createVideoTask(workbench.ui.selectedEpisodeId, {
            ...payload,
            targetType: "storyboard",
            targetId: selectedStoryboard.linkedShotId ?? selectedStoryboard.id,
            prompt: payload.motionPrompt ?? submission.promptPreview,
          }),
          submission,
          "video",
        )
      : await workbench.api.generateVideos(payload);
    workbench.ui.videoGenerationResult = {
      ...result,
      ...submission,
      status: resolveWorkflowStatus(result?.platform?.workflowStatus ?? result?.status),
      taskId: result?.platform?.tasks?.[0]?.taskId ?? result?.taskId ?? null,
      quickReferenceItems: submission.quickReferenceItems,
    };
    if (isRealEpisodeWorkbench(workbench)) {
      applyEpisodeGenerationTaskResult(workbench, result, selectedStoryboard.id, "video");
    } else {
      await refresh(workbench);
    }
    render(workbench);
    if (shouldContinueGenerationPolling(workbench, selectedStoryboard.id, "video")) {
      scheduleGenerationPolling(workbench, selectedStoryboard.id, "video");
    } else {
      workbench.ui.generationPollingActive = false;
    }
  } catch (error) {
    workbench.ui.generationPollingActive = false;
    updateStoryboardGenerationState(workbench, selectedStoryboard.id, (generationState) => ({
      ...generationState,
      lastSubmission: {
        ...(generationState.lastSubmission ?? submission),
        status: "failed",
      },
    }));
    render(workbench);
    throw error;
  } finally {
    workbench.ui.busy = false;
    render(workbench);
  }
}

function createGenerationSubmissionSnapshot(workbench, storyboard, mediaKind) {
  const generationState = storyboard?.generationState ?? createEmptyGenerationState();
  const isVideo = mediaKind === "video";
  return {
    mediaKind,
    storyboardId: storyboard?.id ?? null,
    shotId: storyboard?.linkedShotId ?? null,
    promptPreview: workbench.ui.prompt || storyboard?.description || "",
    quickReferenceItems: [...(generationState.quickReferenceItems ?? [])],
    attachmentItems: [...(workbench.ui.episodeWorkbenchAttachments ?? [])],
    selectionContext: resolveEpisodeAssetSelectionContext(workbench),
    selectedModelId: workbench.ui.selectedModelId ?? null,
    resolution: isVideo
      ? workbench.ui.videoResolution ?? workbench.state?.project?.resolution ?? "1080p"
      : workbench.ui.imageResolution ?? "2K",
    aspectRatio: isVideo
      ? workbench.state?.project?.aspectRatio ?? "9:16"
      : workbench.ui.imageAspectRatio ?? workbench.state?.project?.aspectRatio ?? "9:16",
    durationSec: isVideo ? Number(workbench.ui.videoDurationSec ?? 5) : null,
    creditCost: isVideo ? 4500 : 4500,
    createdAt: new Date().toISOString().slice(0, 19).replace("T", " "),
    status: "running",
  };
}

function scheduleGenerationPolling(workbench, storyboardId, mediaKind) {
  stopGenerationPolling(workbench);
  workbench.generationPollStartedAt = workbench.generationPollStartedAt ?? Date.now();
  workbench.generationPollTimer = window.setTimeout(async () => {
    try {
      if (Date.now() - workbench.generationPollStartedAt > 15 * 60 * 1000) {
        workbench.ui.generationPollingActive = false;
        const targetKey = mediaKind === "video" ? "videoGenerationResult" : "imageGenerationResult";
        workbench.ui[targetKey] = {
          ...(workbench.ui[targetKey] ?? {}),
          status: "failed",
          failureCode: "client_poll_timeout",
        };
        workbench.ui.toast = "生成任务超过 15 分钟未完成，已标记为失败。";
        render(workbench);
        return;
      }
      const taskId =
        mediaKind === "video"
          ? workbench.ui.videoGenerationResult?.taskId
          : workbench.ui.imageGenerationResult?.taskId;
      if (taskId && typeof workbench.api.getGenerationTask === "function") {
        const latestTask = await workbench.api.getGenerationTask(taskId);
        applyEpisodeGenerationTaskResult(workbench, latestTask, storyboardId, mediaKind);
        if (["succeeded", "failed", "canceled"].includes(String(latestTask?.status ?? ""))) {
          finishGenerationPolling(workbench, storyboardId, mediaKind);
          return;
        }
      }
      await refresh(workbench);
      const shouldContinue = shouldContinueGenerationPolling(workbench, storyboardId, mediaKind);
      if (shouldContinue) {
        render(workbench);
        scheduleGenerationPolling(workbench, storyboardId, mediaKind);
        return;
      }
      finishGenerationPolling(workbench, storyboardId, mediaKind);
    } catch (error) {
      workbench.ui.generationPollingActive = false;
      workbench.ui.toast = `轮询刷新失败：${friendlyError(error)}`;
      render(workbench);
    }
  }, 15000);
}

function stopGenerationPolling(workbench) {
  if (workbench.generationPollTimer) {
    window.clearTimeout(workbench.generationPollTimer);
    workbench.generationPollTimer = null;
  }
  if (!workbench.ui.generationPollingActive) {
    workbench.generationPollStartedAt = null;
  }
}

function finishGenerationPolling(workbench, storyboardId, mediaKind) {
  stopGenerationPolling(workbench);
  workbench.generationPollStartedAt = null;
  workbench.ui.generationPollingActive = false;
  updateStoryboardGenerationState(workbench, storyboardId, (generationState) => ({
    ...generationState,
    lastSubmission: generationState.lastSubmission
      ? { ...generationState.lastSubmission, status: "completed" }
      : generationState.lastSubmission,
  }));
  const targetKey = mediaKind === "video" ? "videoGenerationResult" : "imageGenerationResult";
  if (workbench.ui[targetKey]) {
    workbench.ui[targetKey] = {
      ...workbench.ui[targetKey],
      status: "completed",
    };
  }
  render(workbench);
}

function isRealEpisodeWorkbench(workbench) {
  return (
    workbench.ui.projectPanelMode === "episode-workbench" &&
    workbench.ui.selectedEpisodeId &&
    workbench.ui.selectedEpisodeId !== "episode-primary"
  );
}

function normalizeEpisodeTaskForLegacyResult(task, submission, mediaKind) {
  const result = task?.result ?? {};
  const mediaUrl = mediaKind === "video" ? result.videoUrl : result.imageUrl;
  return {
    ...task,
    ...submission,
    status: task?.status === "succeeded" ? "completed" : task?.status ?? "running",
    taskId: task?.taskId ?? null,
    platform: {
      workflowId: task?.workflowId ?? null,
      workflowStatus: task?.workflowStatus ?? task?.status ?? "running",
      tasks: task?.taskId ? [{ taskId: task.taskId, status: task.status }] : [],
    },
    fixedImages: mediaKind === "image" && mediaUrl
      ? [{
          id: result.assetVersionId ?? result.storageObjectId ?? task?.taskId,
          label: "鍒嗛暅鍥剧墖",
          url: mediaUrl,
          storageObjectId: result.storageObjectId ?? null,
          assetVersionId: result.assetVersionId ?? null,
        }]
      : [],
    fixedVideos: mediaKind === "video" && mediaUrl
      ? [{
          id: result.assetVersionId ?? result.storageObjectId ?? task?.taskId,
          label: "鍒嗛暅瑙嗛",
          src: mediaUrl,
          url: mediaUrl,
          storageObjectId: result.storageObjectId ?? null,
          assetVersionId: result.assetVersionId ?? null,
        }]
      : [],
    result,
    creditBalance: task?.creditBalance ?? null,
  };
}

function applyEpisodeGenerationTaskResult(workbench, task, storyboardId, mediaKind) {
  if (!task) {
    return;
  }
  const targetKey = mediaKind === "video" ? "videoGenerationResult" : "imageGenerationResult";
  const current = workbench.ui[targetKey] ?? {};
  const normalized = normalizeEpisodeTaskForLegacyResult(task, current, mediaKind);
  workbench.ui[targetKey] = normalized;
  if (task.status !== "succeeded") {
    return;
  }
  const mediaUrl = mediaKind === "video" ? task.result?.videoUrl : task.result?.imageUrl;
  if (!mediaUrl) {
    return;
  }
  updateStoryboardGenerationState(workbench, storyboardId, (generationState) => ({
    ...generationState,
    lastSubmission: generationState.lastSubmission
      ? { ...generationState.lastSubmission, status: "completed" }
      : generationState.lastSubmission,
  }));
  const storyboards = getActiveStoryboards(workbench).map((storyboard) => {
    if (storyboard.id !== storyboardId) {
      return storyboard;
    }
    if (mediaKind === "video") {
      const videoId = task.result?.assetVersionId ?? task.result?.storageObjectId ?? task.taskId;
      return {
        ...storyboard,
        currentVideoAssetVersionId: task.result?.assetVersionId ?? storyboard.currentVideoAssetVersionId ?? null,
        selectedUploadedVideoId: videoId,
        previewVideo: mediaUrl,
        videoStatus: "ready",
        uploadedVideos: mergeStoryboardUploadedVideos(storyboard.uploadedVideos ?? [], [
          { id: videoId, src: mediaUrl, status: "ready", storageObjectId: task.result?.storageObjectId ?? null },
        ]),
      };
    }
    const imageId = task.result?.assetVersionId ?? task.result?.storageObjectId ?? task.taskId;
    return {
      ...storyboard,
      currentImageAssetVersionId: task.result?.assetVersionId ?? storyboard.currentImageAssetVersionId ?? null,
      previewImageUrl: mediaUrl,
      previewUrl: mediaUrl,
      imageStatus: "ready",
      uploadedImages: [
        ...(storyboard.uploadedImages ?? []).filter((item) => item.id !== imageId),
        { id: imageId, src: mediaUrl, status: "ready", storageObjectId: task.result?.storageObjectId ?? null },
      ],
    };
  });
  replaceActiveStoryboards(workbench, storyboards);
}

function shouldContinueGenerationPolling(workbench, storyboardId, mediaKind) {
  const storyboard = getActiveStoryboards(workbench).find((item) => item.id === storyboardId);
  if (!storyboard) {
    return false;
  }
  if (mediaKind === "video") {
    return !Boolean(storyboard.previewVideo || storyboard.currentVideoAssetVersionId);
  }
  return !Boolean(storyboard.previewImageUrl || storyboard.currentImageAssetVersionId);
}

function dedupeQuickReferenceItems(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.assetId ?? item.id;
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function resolveWorkflowStatus(status) {
  const normalized = String(status ?? "").toLowerCase();
  if (!normalized) {
    return "running";
  }
  if (normalized === "succeeded") {
    return "completed";
  }
  return normalized;
}

function syncEpisodeStoryboardMap(currentMap, primaryStoryboards, customEpisodes = []) {
  const primaryByEpisodeId = new Map();
  for (const storyboard of primaryStoryboards ?? []) {
    const episodeId = storyboard.episodeId ?? "episode-primary";
    const bucket = primaryByEpisodeId.get(episodeId) ?? [];
    bucket.push(storyboard);
    primaryByEpisodeId.set(episodeId, bucket);
  }

  const nextMap = {
    ...(currentMap ?? {}),
  };
  if ((primaryStoryboards ?? []).some((storyboard) => !storyboard?.episodeId)) {
    nextMap["episode-primary"] = primaryStoryboards.filter((storyboard) => !storyboard?.episodeId);
  } else {
    delete nextMap["episode-primary"];
  }

  for (const episode of customEpisodes) {
    const latestStoryboards = primaryByEpisodeId.get(episode.id);
    if (Array.isArray(latestStoryboards) && latestStoryboards.length > 0) {
      nextMap[episode.id] = syncStoryboards(nextMap[episode.id] ?? [], latestStoryboards);
      continue;
    }

    if (!Array.isArray(nextMap[episode.id]) || nextMap[episode.id].length === 0) {
      nextMap[episode.id] = addStoryboard([]);
    }
  }

  return nextMap;
}

function getActiveStoryboards(workbench, primaryStoryboards = workbench.ui.storyboards) {
  if (workbench.ui.projectPanelMode !== "episode-workbench") {
    return primaryStoryboards;
  }

  return getEpisodeStoryboards(workbench, workbench.ui.selectedEpisodeId, primaryStoryboards);
}

function getEpisodeStoryboards(
  workbench,
  episodeId = workbench.ui.selectedEpisodeId,
  primaryStoryboards = workbench.ui.storyboards,
) {
  if (!episodeId || episodeId === "episode-primary") {
    return primaryStoryboards;
  }

  return workbench.ui.episodeStoryboardMap?.[episodeId] ?? [];
}

function ensureEpisodeStoryboards(workbench, episodeId) {
  const existing = getEpisodeStoryboards(workbench, episodeId);
  if (Array.isArray(existing) && existing.length > 0) {
    return existing;
  }

  const seeded = addStoryboard([]);
  workbench.ui.episodeStoryboardMap = {
    ...workbench.ui.episodeStoryboardMap,
    [episodeId]: seeded,
  };
  return seeded;
}

function replaceActiveStoryboards(workbench, nextStoryboards) {
  const normalizedStoryboards = normalizeStoryboardIndices(nextStoryboards);
  if (workbench.ui.projectPanelMode !== "episode-workbench") {
    workbench.ui.storyboards = normalizedStoryboards;
    return;
  }

  const episodeId = workbench.ui.selectedEpisodeId;
  if (!episodeId || episodeId === "episode-primary") {
    workbench.ui.storyboards = normalizedStoryboards;
    return;
  }

  workbench.ui.episodeStoryboardMap = {
    ...workbench.ui.episodeStoryboardMap,
    [episodeId]: normalizedStoryboards,
  };
}

function removeDeletedShotFromState(workbench, shotId) {
  if (!shotId || !workbench.state) {
    return;
  }

  const nextShots = Array.isArray(workbench.state.shots)
    ? workbench.state.shots.filter((shot) => shot.id !== shotId)
    : workbench.state.shots;
  const nextProjectDetail = workbench.state.projectDetail
    ? {
        ...workbench.state.projectDetail,
        shots: Array.isArray(workbench.state.projectDetail.shots)
          ? workbench.state.projectDetail.shots.filter((shot) => shot.id !== shotId)
          : workbench.state.projectDetail.shots,
      }
    : workbench.state.projectDetail;

  workbench.state = {
    ...workbench.state,
    shots: nextShots,
    projectDetail: nextProjectDetail,
  };
  workbench.ui.projectDetail = nextProjectDetail ?? workbench.ui.projectDetail;
  workbench.ui.customEpisodes = getDetailEpisodes(workbench.state);
}

async function deleteStoryboardCard(workbench, storyboardId) {
  if (!storyboardId) {
    return;
  }

  const storyboards = getActiveStoryboards(workbench);
  const storyboard = storyboards.find((item) => item.id === storyboardId);
  if (!storyboard) {
    render(workbench);
    return;
  }

  const nextStoryboards = storyboards.filter((item) => item.id !== storyboardId);
  const applyLocalRemoval = () => {
    replaceActiveStoryboards(workbench, nextStoryboards);
    workbench.ui.selectedStoryboardId =
      workbench.ui.selectedStoryboardId === storyboardId
        ? nextStoryboards[0]?.id ?? null
        : workbench.ui.selectedStoryboardId;
  };

  if (storyboard.linkedShotId && workbench.state?.project?.id) {
    workbench.ui.busy = true;
    workbench.ui.toast = "濠殿喗绻愮徊钘夛耿椤忓牆绀嗛柣妯肩帛閻濈喖鏌涢幒鎴烆棦闁?..";
    render(workbench);
    try {
      await workbench.api.deleteShot({ shotId: storyboard.linkedShotId });
      applyLocalRemoval();
      removeDeletedShotFromState(workbench, storyboard.linkedShotId);
      persistWorkbenchState(workbench);
      workbench.ui.toast = "??????????";
    } catch (error) {
      workbench.ui.toast = `删除失败：${friendlyError(error)}`;
    } finally {
      workbench.ui.busy = false;
      render(workbench);
    }
    return;
  }

  applyLocalRemoval();
  persistWorkbenchState(workbench);
  workbench.ui.toast = "??????????";
  render(workbench);
}

function syncSelectedStoryboardId(workbench, storyboards) {
  if (!workbench.ui.selectedStoryboardId && storyboards.length > 0) {
    workbench.ui.selectedStoryboardId = storyboards[0].id;
    return;
  }

  if (
    workbench.ui.selectedStoryboardId &&
    !storyboards.some((storyboard) => storyboard.id === workbench.ui.selectedStoryboardId)
  ) {
    workbench.ui.selectedStoryboardId = storyboards[0]?.id ?? null;
  }
}

function hydratePersistedWorkbenchState(workbench) {
  const persisted = readWorkbenchState(workbench.state?.project?.id ?? null);
  if (!persisted) {
    return;
  }

  if (Array.isArray(persisted.storyboards)) {
    workbench.ui.storyboards = persisted.storyboards;
  }
  if (persisted.episodeStoryboardMap && typeof persisted.episodeStoryboardMap === "object") {
    workbench.ui.episodeStoryboardMap = persisted.episodeStoryboardMap;
  }
  if (Array.isArray(persisted.customEpisodes)) {
    workbench.ui.customEpisodes = persisted.customEpisodes;
  }
  if (typeof persisted.selectedEpisodeId === "string" || persisted.selectedEpisodeId === null) {
    workbench.ui.selectedEpisodeId = persisted.selectedEpisodeId;
  }
  if (typeof persisted.selectedStoryboardId === "string" || persisted.selectedStoryboardId === null) {
    workbench.ui.selectedStoryboardId = persisted.selectedStoryboardId;
  }
  if (typeof persisted.projectPanelMode === "string") {
    workbench.ui.projectPanelMode = persisted.projectPanelMode;
  }
  if (typeof persisted.projectInteriorSection === "string") {
    workbench.ui.projectInteriorSection = persisted.projectInteriorSection;
  }
}

function syncWorkbenchRouteState(workbench, hash) {
  const token = String(hash || "").replace(/^#/, "");
  if (parseEpisodeRouteToken(token)) {
    workbench.ui.activeNavTab = "project";
    workbench.ui.projectPanelMode = "episode-workbench";
    workbench.ui.projectInteriorSection = "episodes";
    return;
  }
  if (parseProjectRouteToken(token)) {
    workbench.ui.activeNavTab = "project";
    workbench.ui.projectPanelMode = "workspace";
    workbench.ui.projectInteriorSection = "episodes";
    return;
  }
  if (token === "project") {
    workbench.ui.activeNavTab = "project";
    workbench.ui.projectPanelMode = "library";
    return;
  }
  if (token === "project-workspace" || token === "asset-prep-section") {
    workbench.ui.activeNavTab = "project";
    workbench.ui.projectPanelMode = "workspace";
    workbench.ui.projectInteriorSection = workbench.ui.projectInteriorSection ?? "overview";
    return;
  }
  if (token !== "storyboard-workbench" && token !== "episode-workbench") {
    return;
  }

  workbench.ui.activeNavTab = "project";
  workbench.ui.projectPanelMode = "episode-workbench";
  workbench.ui.projectInteriorSection = "episodes";
  workbench.ui.selectedEpisodeId =
    workbench.ui.selectedEpisodeId ?? getDefaultEpisodeWorkbenchId(workbench);
}

async function restoreEpisodeRouteState(workbench, locationLike) {
  const route = parseEpisodeRouteFromLocation(locationLike);
  if (!route) {
    return false;
  }

  workbench.ui.activeNavTab = "project";
  workbench.ui.projectPanelMode = "episode-workbench";
  workbench.ui.projectInteriorSection = "episodes";
  workbench.ui.selectedProjectCardId = route.projectId;
  workbench.ui.selectedEpisodeId = route.episodeId;

  try {
    if (workbench.state?.project?.id !== route.projectId) {
      applyProjectDetail(workbench, await loadProjectDetailForWorkbench(workbench, route.projectId));
      await syncProjectInteriorSupplementary(workbench);
    }
    await enterEpisodeWorkbench(workbench, route.episodeId, {
      preserveRoute: true,
      shouldRender: false,
    });
    return true;
  } catch (error) {
    workbench.ui.selectedEpisodeId = null;
    workbench.ui.projectPanelMode = "workspace";
    workbench.ui.projectInteriorSection = "episodes";
    workbench.ui.episodeWorkbenchContext = null;
    workbench.ui.episodeWorkbenchError = friendlyError(error);
    workbench.ui.toast = `Episode route restore failed: ${workbench.ui.episodeWorkbenchError}`;
    return false;
  }
}

async function restoreProjectRouteState(workbench, locationLike) {
  const route = parseProjectRouteFromLocation(locationLike);
  if (!route) {
    return false;
  }

  workbench.ui.activeNavTab = "project";
  workbench.ui.projectPanelMode = "workspace";
  workbench.ui.projectInteriorSection = "episodes";
  workbench.ui.selectedProjectCardId = route.projectId;

  try {
    applyProjectDetail(workbench, await loadProjectDetailForWorkbench(workbench, route.projectId));
    await syncProjectInteriorSupplementary(workbench);
    return true;
  } catch (error) {
    workbench.ui.projectPanelMode = "library";
    workbench.ui.episodeWorkbenchError = friendlyError(error);
    workbench.ui.toast = `Project route restore failed: ${workbench.ui.episodeWorkbenchError}`;
    return false;
  }
}

function parseEpisodeRouteFromLocation(locationLike) {
  const hashRoute = parseEpisodeRouteToken(locationLike?.hash ?? "");
  if (hashRoute) {
    return hashRoute;
  }
  return parseEpisodeRouteToken(locationLike?.pathname ?? "");
}

function parseProjectRouteFromLocation(locationLike) {
  const hashRoute = parseProjectRouteToken(locationLike?.hash ?? "");
  if (hashRoute) {
    return hashRoute;
  }
  return parseProjectRouteToken(locationLike?.pathname ?? "");
}

export function parseEpisodeRouteForWorkbench(locationLike) {
  return parseEpisodeRouteFromLocation(locationLike);
}

export function parseProjectRouteForWorkbench(locationLike) {
  return parseProjectRouteFromLocation(locationLike);
}

function parseEpisodeRouteToken(value) {
  const token = decodeURIComponent(String(value || ""))
    .replace(/^#/, "")
    .replace(/^\//, "")
    .replace(/^!\/?/, "");
  const match = token.match(/^projects?\/([^/?#]+)\/episodes\/([^/?#]+)/);
  if (!match) {
    return null;
  }
  return {
    projectId: match[1],
    episodeId: match[2],
  };
}

function parseProjectRouteToken(value) {
  const token = decodeURIComponent(String(value || ""))
    .replace(/^#/, "")
    .replace(/^\//, "")
    .replace(/^!\/?/, "");
  const match = token.match(/^projects?\/([^/?#]+)\/?$/);
  if (!match) {
    return null;
  }
  return {
    projectId: match[1],
  };
}

function getDefaultEpisodeWorkbenchId(workbench) {
  const episodes = getDetailEpisodes(workbench.state);
  const realEpisode = episodes.find((episode) => episode?.id && episode.id !== "episode-primary");
  return realEpisode?.id ?? episodes[0]?.id ?? "episode-primary";
}

function persistWorkbenchState(workbench) {
  const projectId = workbench.state?.project?.id ?? null;
  if (!projectId) {
    return;
  }

  writeWorkbenchState(projectId, {
    selectedEpisodeId: workbench.ui.selectedEpisodeId ?? null,
    selectedStoryboardId: workbench.ui.selectedStoryboardId ?? null,
    projectPanelMode: workbench.ui.projectPanelMode ?? "library",
    projectInteriorSection: workbench.ui.projectInteriorSection ?? "overview",
    storyboards: Array.isArray(workbench.ui.storyboards) ? workbench.ui.storyboards : [],
    episodeStoryboardMap: workbench.ui.episodeStoryboardMap ?? {},
    customEpisodes: Array.isArray(workbench.ui.customEpisodes) ? workbench.ui.customEpisodes : [],
  });
}

function readWorkbenchState(projectId) {
  if (typeof window === "undefined" || !window.localStorage || !projectId) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getWorkbenchStorageKey(projectId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeWorkbenchState(projectId, payload) {
  if (typeof window === "undefined" || !window.localStorage || !projectId) {
    return;
  }

  try {
    window.localStorage.setItem(getWorkbenchStorageKey(projectId), JSON.stringify(payload));
  } catch {
    // Ignore persistence failures in constrained browsers.
  }
}

function getWorkbenchStorageKey(projectId) {
  return `${WORKBENCH_STORAGE_PREFIX}:${projectId}`;
}

async function handleTeamAssetLocalUploadFiles(workbench, category, files) {
  const acceptedFiles = [];
  let rejectedCount = 0;
  let rejectMessage = "";

  for (const file of files) {
    const validation = validateTeamAssetLocalUploadFile(category, file);
    if (!validation.ok) {
      rejectedCount += 1;
      rejectMessage = rejectMessage || validation.message;
      continue;
    }
    acceptedFiles.push({ file, validation });
  }

  if (!acceptedFiles.length) {
    workbench.ui.toast = rejectMessage || "请选择支持格式的文件。";
    render(workbench);
    return;
  }

  const nextUploads = await Promise.all(
    acceptedFiles.map(({ file, validation }) =>
      buildTeamAssetLocalUploadRecord(category, file, validation),
    ),
  );
  const currentUploads = workbench.ui.teamAssetLocalUploads ?? {};

  workbench.ui.teamAssetLocalUploads = {
    character: [],
    scene: [],
    prop: [],
    voice: [],
    ...currentUploads,
    [category]: [...(currentUploads[category] ?? []), ...nextUploads],
  };

  const label = category === "voice" ? "音频" : "图片";
  workbench.ui.toast =
    rejectedCount > 0
      ? `已添加 ${nextUploads.length} 个本地${label}预览，${rejectedCount} 个文件格式不支持。`
      : `已添加 ${nextUploads.length} 个本地${label}预览。`;
  render(workbench, { preserveLibraryScroll: true });
}

async function buildTeamAssetLocalUploadRecord(category, file, validation) {
  const mediaType = validation.mediaType;
  const previewUrl =
    mediaType === "audio" && typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
      ? URL.createObjectURL(file)
      : await readFileAsDataUrl(file);

  return {
    id: `team-local-${category}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    fileName: file.name,
    previewUrl,
    mimeType: file.type || validation.mimeType || validation.extension?.toUpperCase() || "",
    extension: validation.extension,
    sizeLabel: formatFileSizeLabel(file.size),
    createdAt: Date.now(),
  };
}

async function handleAssetImportFiles(workbench, files) {
  const assetKind = workbench.ui.assetImportModal ?? workbench.ui.projectAssetTab ?? "character";
  const existingDrafts = workbench.ui.assetImportDrafts ?? [];
  const slotsLeft = Math.max(20 - existingDrafts.length, 0);
  const acceptedFiles = files.slice(0, slotsLeft);

  if (!acceptedFiles.length) {
    workbench.ui.toast = "一次最多可导入 20 个本地资产。";
    render(workbench);
    return;
  }

  const nextDrafts = await Promise.all(
    acceptedFiles.map((file, index) =>
      buildAssetImportDraftFromFile(workbench, assetKind, existingDrafts.length + index, file),
    ),
  );

  workbench.ui.assetImportDrafts = [...existingDrafts, ...nextDrafts];
  workbench.ui.assetImportSelection = createAssetSelectionList([
    ...(workbench.ui.assetImportSelection ?? []),
    ...nextDrafts.map((draft) => draft.id),
  ]);
  workbench.ui.toast =
    files.length > acceptedFiles.length
      ? `已导入 ${acceptedFiles.length} 个资产，超出部分已忽略。`
      : `已添加 ${acceptedFiles.length} 个待导入资产。`;
  render(workbench);
}

async function handleLocalStoryboardVideoFiles(workbench, storyboardId, files) {
  const acceptedFiles = files.filter((file) => String(file.type || "").startsWith("video/"));
  if (!acceptedFiles.length) {
    workbench.ui.toast = "请选择视频文件后再上传。";
    render(workbench);
    return;
  }

  for (const file of acceptedFiles) {
    await startStoryboardVideoUpload(workbench, storyboardId, file);
  }

  workbench.ui.toast = `已添加 ${acceptedFiles.length} 个待上传视频。`;
  render(workbench);
}

async function handleLocalStoryboardImageFile(workbench, storyboardId, file) {
  if (!String(file.type || "").startsWith("image/")) {
    workbench.ui.toast = "请选择图片文件后再上传。";
    render(workbench);
    return;
  }

  const existingStoryboard = getActiveStoryboards(workbench).find((item) => item.id === storyboardId);
  const hadPinnedImage = Boolean(existingStoryboard?.previewImageUrl || existingStoryboard?.currentImageAssetVersionId);

  updateStoryboardById(workbench, storyboardId, (storyboard) => ({
    ...storyboard,
    imageStatus: "uploading",
    uploadedImageName: file.name,
  }));
  workbench.ui.toast = "正在上传分镜图片...";
  render(workbench);

  let upload;
  try {
    upload = await uploadLocalFile(workbench, file, "storyboard-images");
  } catch (error) {
    updateStoryboardById(workbench, storyboardId, (storyboard) => ({
      ...storyboard,
      imageStatus: storyboard.previewImageUrl ? "ready" : "empty",
    }));
    workbench.ui.toast = `Image upload failed: ${friendlyError(error)}`;
    render(workbench);
    return;
  }

  const previewImageUrl = resolveApiUrl(upload.publicUrl);
  const createImageEntry = (imageId) => ({
    id: imageId,
    deleteAssetId: imageId,
    fileName: file.name,
    src: previewImageUrl,
    status: "ready",
    createdAt: Date.now(),
  });
  const applyLocalReadyImage = (imageId, toastMessage) => {
    updateStoryboardById(workbench, storyboardId, (storyboard) => {
      const shouldAutoPin = !hadPinnedImage;
      const uploadedImage = createImageEntry(imageId);
      const nextStoryboard = {
        ...storyboard,
        imageStatus: "ready",
        uploadedImages: mergeStoryboardUploadedImages(storyboard.uploadedImages ?? [], [uploadedImage]),
        previewImageUrl: shouldAutoPin ? previewImageUrl : storyboard.previewImageUrl ?? null,
        uploadedImageName: shouldAutoPin ? file.name : storyboard.uploadedImageName,
        currentImageAssetVersionId: shouldAutoPin ? uploadedImage.id : storyboard.currentImageAssetVersionId ?? null,
      };
      return {
        ...nextStoryboard,
        previewUrl: shouldAutoPin ? previewImageUrl : resolveStoryboardCombinedPreviewUrl(nextStoryboard),
      };
    });
    workbench.ui.toast = toastMessage;
    render(workbench);
  };
  let storyboard = getActiveStoryboards(workbench).find((item) => item.id === storyboardId);
  if (!storyboard?.linkedShotId && workbench.state?.project?.id) {
    try {
      storyboard = await ensureStoryboardShot(workbench, storyboardId);
    } catch (error) {
      applyLocalReadyImage(
        `local-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        `Image kept locally; backend sync failed: ${friendlyError(error)}`,
      );
      return;
    }
  }
  const activeStoryboardId = storyboard?.id ?? storyboardId;
  if (storyboard?.linkedShotId) {
    let importedVersionId = null;
    let importSucceeded = false;
    await runAction(workbench, "婵犵數濮甸鏍窗濡ゅ啯宕查柟閭﹀枛缁躲倝鏌﹀Ο渚闁肩増瀵ч妵鍕疀閹炬潙娅ч梺宕囩帛閺屻劑鍩為幋锔藉亹閺夊牜鍋勯崢锟犳⒑缂佹ê濮囬柨鏇ㄤ邯瀵鈽夐姀鐘殿唺闂佺懓顕崕鎰涢敃鍌涒拺闁告繂瀚ˉ婊堟煙閾忣個顏堟偩?..", async () => {
      const bound = await bindEpisodeUploadIfAvailable(workbench, upload, {
        targetType: "storyboard",
        targetId: activeStoryboardId,
        mediaKind: "image",
        width: 1024,
        height: 1024,
      });
      const imported = bound
        ? null
        : await workbench.api.importShotMedia(storyboard.linkedShotId, {
            kind: "image",
            name: file.name,
            uploadSessionId: upload.uploadSessionId,
            storageObjectId: upload.storageObjectId,
            mimeType: upload.mimeType,
            width: 1024,
            height: 1024,
          });
      importedVersionId = bound?.fileResource?.assetVersionId ?? imported?.version?.id ?? null;
      updateStoryboardById(workbench, activeStoryboardId, (currentStoryboard) => {
        const shouldAutoPin = !hadPinnedImage;
        const importedImage = createImageEntry(importedVersionId ?? `local-image-${Date.now()}`);
        importedImage.assetVersionId = importedVersionId;
        importedImage.storageObjectId = bound?.fileResource?.storageObjectId ?? upload.storageObjectId ?? null;
        importedImage.src = resolveApiUrl(bound?.file?.previewUrl ?? importedImage.src);
        const nextStoryboard = {
          ...currentStoryboard,
          imageStatus: "ready",
          uploadedImages: mergeStoryboardUploadedImages(currentStoryboard.uploadedImages ?? [], [importedImage]),
          previewImageUrl: shouldAutoPin ? importedImage.src : currentStoryboard.previewImageUrl ?? null,
          uploadedImageName: shouldAutoPin ? file.name : currentStoryboard.uploadedImageName,
          currentImageAssetVersionId:
            shouldAutoPin ? importedImage.id : currentStoryboard.currentImageAssetVersionId ?? null,
        };
        return {
          ...nextStoryboard,
          previewUrl: shouldAutoPin ? importedImage.src : resolveStoryboardCombinedPreviewUrl(nextStoryboard),
        };
      });
      if (hadPinnedImage && storyboard.currentImageAssetVersionId) {
        await workbench.api.updateShot({
          shotId: storyboard.linkedShotId,
          currentImageAssetVersionId: storyboard.currentImageAssetVersionId,
        });
      }
      importSucceeded = true;
    });
    if (!importSucceeded) {
      applyLocalReadyImage(
        importedVersionId ?? `local-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        `${file.name} uploaded locally; backend sync is still pending.`,
      );
    }
    return;
  }

  updateStoryboardById(workbench, activeStoryboardId, (storyboard) => {
    const shouldAutoPin = !hadPinnedImage;
    const uploadedImage = createImageEntry(`local-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    const nextStoryboard = {
      ...storyboard,
      imageStatus: "ready",
      uploadedImages: mergeStoryboardUploadedImages(storyboard.uploadedImages ?? [], [uploadedImage]),
      previewImageUrl: shouldAutoPin ? previewImageUrl : storyboard.previewImageUrl ?? null,
      uploadedImageName: shouldAutoPin ? file.name : storyboard.uploadedImageName,
      currentImageAssetVersionId: shouldAutoPin ? uploadedImage.id : storyboard.currentImageAssetVersionId ?? null,
    };
    return {
      ...nextStoryboard,
      previewUrl: shouldAutoPin ? previewImageUrl : resolveStoryboardCombinedPreviewUrl(nextStoryboard),
    };
  });

  workbench.ui.toast = `??? ${file.name} ??????`;
  render(workbench);
}

async function startStoryboardVideoUpload(workbench, storyboardId, file) {
  const videoId = `local-video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const localPreviewSrc = URL.createObjectURL(file);
  let storyboard = getActiveStoryboards(workbench).find((item) => item.id === storyboardId);
  if (!storyboard?.linkedShotId && workbench.state?.project?.id) {
    try {
      storyboard = await ensureStoryboardShot(workbench, storyboardId);
    } catch (error) {
      cancelStoryboardVideoUpload(workbench, storyboardId, videoId);
      updateStoryboardById(workbench, storyboardId, (currentStoryboard) => {
        const localReadyVideo = {
          id: videoId,
          fileName: file.name,
          src: localPreviewSrc,
          progress: 100,
          status: "ready",
          durationLabel: "00:10",
          createdAt: Date.now(),
          thumbnailSrc: null,
        };
        const uploadedVideos = [...(currentStoryboard.uploadedVideos ?? []).filter((video) => video.id !== videoId), localReadyVideo];
        const nextStoryboard = {
          ...currentStoryboard,
          uploadedVideos,
          selectedUploadedVideoId: currentStoryboard.selectedUploadedVideoId ?? videoId,
          videoStatus: "ready",
          previewVideo: currentStoryboard.previewVideo ?? localReadyVideo.src,
          previewThumbnailUrl: currentStoryboard.previewThumbnailUrl ?? null,
        };
        return {
          ...nextStoryboard,
          previewUrl: resolveStoryboardCombinedPreviewUrl(nextStoryboard),
        };
      });
      workbench.ui.toast = `创建分镜视频失败：${friendlyError(error)}`;
      render(workbench);
      return;
    }
  }
  const hadPinnedVideo = Boolean(storyboard?.selectedUploadedVideoId);
  const pendingVideo = {
    id: videoId,
    fileName: file.name,
    src: localPreviewSrc,
    progress: 12,
    status: "uploading",
    durationLabel: "00:10",
    createdAt: Date.now(),
    thumbnailSrc: null,
  };

  workbench.uploadTasks.set(videoId, { src: localPreviewSrc });
  updateStoryboardById(workbench, storyboardId, (currentStoryboard) => ({
    ...currentStoryboard,
    uploadedVideos: [...(currentStoryboard.uploadedVideos ?? []), pendingVideo],
    selectedUploadedVideoId: currentStoryboard.selectedUploadedVideoId ?? videoId,
    videoStatus: "uploading",
  }));
  workbench.ui.toast = "Uploading storyboard video...";
  render(workbench);

  let upload;
  try {
    upload = await uploadLocalFile(workbench, file, "storyboard-videos", {
      onProgress(progress) {
        const percent = Math.max(0, Math.min(100, Math.round((progress?.progress ?? 0) * 100)));
        updateStoryboardById(workbench, storyboardId, (currentStoryboard) => ({
          ...currentStoryboard,
          uploadedVideos: (currentStoryboard.uploadedVideos ?? []).map((video) =>
            video.id === videoId
              ? {
                  ...video,
                  progress: percent,
                  status: "uploading",
                }
              : video,
          ),
        }));
        render(workbench);
      },
    });
  } catch (error) {
    cancelStoryboardVideoUpload(workbench, storyboardId, videoId);
    workbench.ui.toast = `Video upload failed: ${friendlyError(error)}`;
    render(workbench);
    return;
  }

  if (!isStoryboardVideoPending(workbench, storyboardId, videoId)) {
    URL.revokeObjectURL(localPreviewSrc);
    workbench.uploadTasks.delete(videoId);
    return;
  }

  const resolvedUploadUrl = resolveApiUrl(upload.publicUrl);
  URL.revokeObjectURL(localPreviewSrc);
  workbench.uploadTasks.delete(videoId);
  const localReadyVideo = {
    id: videoId,
    fileName: file.name,
    src: resolvedUploadUrl,
    progress: 100,
    status: "ready",
    durationLabel: "00:10",
    createdAt: Date.now(),
    thumbnailSrc: null,
  };

  updateStoryboardById(workbench, storyboardId, (currentStoryboard) => {
    const uploadedVideos = (currentStoryboard.uploadedVideos ?? []).map((video) =>
      video.id === videoId ? localReadyVideo : video,
    );
    const shouldAutoPin = !hadPinnedVideo;
    const nextStoryboard = {
      ...currentStoryboard,
      uploadedVideos,
      selectedUploadedVideoId: shouldAutoPin ? videoId : currentStoryboard.selectedUploadedVideoId,
      videoStatus: "ready",
      previewVideo: shouldAutoPin ? localReadyVideo.src : currentStoryboard.previewVideo ?? null,
      previewThumbnailUrl:
        shouldAutoPin ? (localReadyVideo.thumbnailSrc ?? null) : currentStoryboard.previewThumbnailUrl ?? null,
    };
    return {
      ...nextStoryboard,
      previewUrl: resolveStoryboardCombinedPreviewUrl(nextStoryboard),
    };
  });
  workbench.ui.toast = `${file.name} uploaded.`;
  render(workbench);
  hydrateStoryboardVideoPreview(workbench, storyboardId, videoId, resolvedUploadUrl);

  if (storyboard?.linkedShotId) {
    await runAction(workbench, "婵犵數濮甸鏍窗濡ゅ啯宕查柟閭﹀枛缁躲倝鏌﹀Ο渚闁肩増瀵ч妵鍕疀閹炬潙娅ч梺宕囩帛閺屻劑鍩為幋锔藉亹閺夊牜鍋勯崢锟犳⒑缂佹ê濮囬柨鏇ㄤ邯瀵鈽夐姀鐘殿唺闂佺懓顕崕鎰涢敃鍌涒拺闁告繂瀚ˉ婊堟煙閾忣偄濮嶆鐐差樀楠炴﹢顢欓悡搴も偓鍨攽閻愭潙鐏卞瀵割焾閳?..", async () => {
      const bound = await bindEpisodeUploadIfAvailable(workbench, upload, {
        targetType: "storyboard",
        targetId: storyboardId,
        mediaKind: "video",
        width: 1024,
        height: 1024,
      });
      const imported = bound
        ? null
        : await workbench.api.importShotMedia(storyboard.linkedShotId, {
            kind: "video",
            name: file.name,
            uploadSessionId: upload.uploadSessionId,
            storageObjectId: upload.storageObjectId,
            mimeType: upload.mimeType,
            width: 1024,
            height: 1024,
          });
      const boundPreviewUrl = resolveApiUrl(bound?.file?.previewUrl ?? resolvedUploadUrl);
      const importedVideo = {
        id: bound?.fileResource?.assetVersionId ?? imported?.version?.id ?? videoId,
        assetVersionId: bound?.fileResource?.assetVersionId ?? imported?.version?.id ?? null,
        fileName: file.name,
        src: boundPreviewUrl,
        progress: 100,
        status: "ready",
        durationLabel: formatDurationLabelFromMs(imported?.version?.metadata?.durationMs),
        createdAt: Date.parse(imported?.version?.createdAt ?? "") || Date.now(),
        storageObjectId: bound?.fileResource?.storageObjectId ?? upload.storageObjectId ?? null,
        thumbnailSrc:
          getActiveStoryboards(workbench)
            .find((item) => item.id === storyboardId)
            ?.uploadedVideos?.find((video) => video.id === videoId)?.thumbnailSrc ?? null,
      };
      updateStoryboardById(workbench, storyboardId, (currentStoryboard) => {
        const withoutPending = (currentStoryboard.uploadedVideos ?? []).filter((video) => video.id !== videoId);
        const uploadedVideos = mergeStoryboardUploadedVideos(withoutPending, [importedVideo]);
        const shouldAutoPin = !hadPinnedVideo;
        const selectedUploadedVideoId =
          currentStoryboard.selectedUploadedVideoId === videoId
            ? importedVideo.id
            : shouldAutoPin
              ? importedVideo.id
              : currentStoryboard.selectedUploadedVideoId;
        return {
          ...currentStoryboard,
          uploadedVideos,
          selectedUploadedVideoId,
          videoStatus: "ready",
          previewVideo: selectedUploadedVideoId === importedVideo.id ? importedVideo.src : currentStoryboard.previewVideo ?? null,
          previewThumbnailUrl:
            selectedUploadedVideoId === importedVideo.id
              ? (importedVideo.thumbnailSrc ?? null)
              : currentStoryboard.previewThumbnailUrl ?? null,
          currentVideoAssetVersionId:
            selectedUploadedVideoId === importedVideo.id
              ? importedVideo.id
              : currentStoryboard.currentVideoAssetVersionId,
        };
        const nextStoryboard = {
          ...currentStoryboard,
          uploadedVideos,
          selectedUploadedVideoId,
          videoStatus: "ready",
          previewVideo: selectedUploadedVideoId === importedVideo.id ? importedVideo.src : currentStoryboard.previewVideo ?? null,
          previewThumbnailUrl:
            selectedUploadedVideoId === importedVideo.id
              ? (importedVideo.thumbnailSrc ?? null)
              : currentStoryboard.previewThumbnailUrl ?? null,
          currentVideoAssetVersionId:
            selectedUploadedVideoId === importedVideo.id
              ? importedVideo.id
              : currentStoryboard.currentVideoAssetVersionId,
        };
        return {
          ...nextStoryboard,
          previewUrl: resolveStoryboardCombinedPreviewUrl(nextStoryboard),
        };
      });
      hydrateStoryboardVideoPreview(workbench, storyboardId, importedVideo.id, importedVideo.src);
    });
    return;
  }

}

function isStoryboardVideoPending(workbench, storyboardId, videoId) {
  return Boolean(
    getActiveStoryboards(workbench)
      .find((storyboard) => storyboard.id === storyboardId)
      ?.uploadedVideos?.some((video) => video.id === videoId && video.status === "uploading"),
  );
}

function cancelStoryboardVideoUpload(workbench, storyboardId, videoId) {
  if (!storyboardId || !videoId) {
    return;
  }

  const task = workbench.uploadTasks.get(videoId);
  if (task) {
    window.clearInterval(task.intervalId);
    if (task.src && String(task.src).startsWith("blob:")) {
      URL.revokeObjectURL(task.src);
    }
    workbench.uploadTasks.delete(videoId);
  }

  updateStoryboardById(workbench, storyboardId, (storyboard) => {
    const uploadedVideos = (storyboard.uploadedVideos ?? []).filter((video) => video.id !== videoId);
    if (uploadedVideos.length === (storyboard.uploadedVideos ?? []).length) {
      return storyboard;
    }
    const selectedUploadedVideoId =
      storyboard.selectedUploadedVideoId === videoId
        ? uploadedVideos.find((video) => video.status === "ready")?.id ?? uploadedVideos[0]?.id ?? null
        : storyboard.selectedUploadedVideoId;
    const selectedVideo =
      uploadedVideos.find((video) => video.id === selectedUploadedVideoId && video.status === "ready") ?? null;
    const nextStoryboard = {
      ...storyboard,
      uploadedVideos,
      selectedUploadedVideoId,
      videoStatus: uploadedVideos.some((video) => video.status === "ready") ? "ready" : "empty",
      previewVideo: storyboard.selectedUploadedVideoId === videoId ? selectedVideo?.src ?? null : storyboard.previewVideo,
      previewThumbnailUrl:
        storyboard.selectedUploadedVideoId === videoId ? selectedVideo?.thumbnailSrc ?? null : storyboard.previewThumbnailUrl,
    };
    return {
      ...nextStoryboard,
      previewUrl: resolveStoryboardCombinedPreviewUrl(nextStoryboard),
    };
  });
}

async function selectStoryboardUploadedVideo(workbench, storyboardId, videoId) {
  if (!storyboardId || !videoId) {
    return;
  }

  const storyboard = getActiveStoryboards(workbench).find((item) => item.id === storyboardId);
  const selectedVideo = (storyboard?.uploadedVideos ?? []).find(
    (video) => video.id === videoId && video.status === "ready",
  );
  if (!selectedVideo) {
    return;
  }

  const applyLocalSelection = () => {
    updateStoryboardById(workbench, storyboardId, (currentStoryboard) => {
      const currentSelectedVideo = (currentStoryboard.uploadedVideos ?? []).find(
        (video) => video.id === videoId && video.status === "ready",
      );
      if (!currentSelectedVideo) {
        return currentStoryboard;
      }
      const nextStoryboard = {
        ...currentStoryboard,
        selectedUploadedVideoId: videoId,
        previewVideo: currentSelectedVideo.src,
        previewThumbnailUrl: currentSelectedVideo.thumbnailSrc ?? null,
        currentVideoAssetVersionId: videoId,
      };
      return {
        ...nextStoryboard,
        previewUrl: resolveStoryboardCombinedPreviewUrl(nextStoryboard),
      };
    });
  };

  if (storyboard?.linkedShotId) {
    await runAction(workbench, "姝ｅ湪璁剧疆鍒嗛暅瑙嗛...", async () => {
      await workbench.api.updateShot({
        shotId: storyboard.linkedShotId,
        currentVideoAssetVersionId: videoId,
      });
      applyLocalSelection();
    });
    render(workbench);
    hydrateStoryboardVideoPreview(workbench, storyboardId, videoId, selectedVideo.src);
    return;
  }

  applyLocalSelection();
  render(workbench);
  hydrateStoryboardVideoPreview(workbench, storyboardId, videoId, selectedVideo.src);
}

async function setStoryboardVideoResult(workbench, storyboardId, videoId) {
  const storyboard = getActiveStoryboards(workbench).find((item) => item.id === storyboardId);
  const selectedVideo = (storyboard?.uploadedVideos ?? []).find(
    (video) => video.id === videoId && video.status === "ready",
  );
  if (!selectedVideo) {
    return;
  }
  if (
    isRealEpisodeWorkbench(workbench) &&
    typeof workbench.api.setStoryboardVideo === "function" &&
    isUuidLike(storyboardId) &&
    isUuidLike(videoId)
  ) {
    await runAction(workbench, "姝ｅ湪璁剧疆鍒嗛暅瑙嗛...", async () => {
      const result = await workbench.api.setStoryboardVideo(
        workbench.ui.selectedEpisodeId,
        storyboardId,
        {
          assetVersionId: videoId,
          storageObjectId: selectedVideo.storageObjectId ?? null,
        },
      );
      updateStoryboardById(workbench, storyboardId, (currentStoryboard) => {
        const file = result?.file ?? {};
        const src = file.previewUrl ?? selectedVideo.src;
        const nextStoryboard = {
          ...currentStoryboard,
          selectedUploadedVideoId: videoId,
          previewVideo: src,
          previewThumbnailUrl: selectedVideo.thumbnailSrc ?? null,
          currentVideoAssetVersionId: result?.storyboard?.currentVideoFileId ?? videoId,
          videoStatus: "ready",
          uploadedVideos: mergeStoryboardUploadedVideos(currentStoryboard.uploadedVideos ?? [], [
            {
              ...selectedVideo,
              id: result?.storyboard?.currentVideoFileId ?? videoId,
              src,
              storageObjectId: file.storageObjectId ?? selectedVideo.storageObjectId ?? null,
              status: "ready",
            },
          ]),
        };
        return {
          ...nextStoryboard,
          previewUrl: resolveStoryboardCombinedPreviewUrl(nextStoryboard),
        };
      });
    });
    hydrateStoryboardVideoPreview(workbench, storyboardId, videoId, selectedVideo.src);
    return;
  }
  await selectStoryboardUploadedVideo(workbench, storyboardId, videoId);
}

async function setStoryboardImageResult(workbench, storyboardId, imageId) {
  const storyboard = getActiveStoryboards(workbench).find((item) => item.id === storyboardId);
  const image = findStoryboardImage(storyboard, imageId);
  if (!storyboardId || !image) {
    workbench.ui.toast = "当前没有可设置的分镜图片。";
    render(workbench);
    return;
  }
  if (
    isRealEpisodeWorkbench(workbench) &&
    typeof workbench.api.setStoryboardImage === "function" &&
    isUuidLike(storyboardId) &&
    isUuidLike(image.id)
  ) {
    await runAction(workbench, "正在设置分镜图片...", async () => {
      const result = await workbench.api.setStoryboardImage(
        workbench.ui.selectedEpisodeId,
        storyboardId,
        {
          assetVersionId: image.id,
          storageObjectId: image.storageObjectId ?? null,
        },
      );
      const file = result?.file ?? {};
      updateStoryboardById(workbench, storyboardId, (currentStoryboard) => {
        const src = file.previewUrl ?? image.src;
        return {
          ...currentStoryboard,
          currentImageAssetVersionId: result?.storyboard?.currentImageFileId ?? image.id,
          previewImageUrl: src,
          previewUrl: src,
          imageStatus: "ready",
          uploadedImages: [
            ...(currentStoryboard.uploadedImages ?? []).filter((item) => item.id !== image.id),
            {
              ...image,
              id: result?.storyboard?.currentImageFileId ?? image.id,
              src,
              storageObjectId: file.storageObjectId ?? image.storageObjectId ?? null,
              status: "ready",
            },
          ],
        };
      });
    });
    return;
  }
  updateStoryboardById(workbench, storyboardId, (currentStoryboard) => ({
    ...currentStoryboard,
    currentImageAssetVersionId: image.id,
    previewImageUrl: image.src,
    previewUrl: image.src,
    imageStatus: "ready",
  }));
  render(workbench);
}

async function createEpisodeExportPreview(workbench) {
  if (
    isRealEpisodeWorkbench(workbench) &&
    typeof workbench.api.createEpisodeExportTask === "function"
  ) {
    const storyboards = getActiveStoryboards(workbench);
    const video =
      storyboards
        .flatMap((storyboard) => storyboard.uploadedVideos ?? [])
        .find((item) => isUuidLike(item.id) && (item.storageObjectId || item.src)) ??
      null;
    if (!video) {
      workbench.ui.toast = "当前没有可导出的原视频。";
      return null;
    }
    const result = await workbench.api.createEpisodeExportTask(workbench.ui.selectedEpisodeId, {
      assetVersionId: video.id,
      storageObjectId: video.storageObjectId ?? null,
    });
    return {
      exportRecord: result?.exportTask ?? null,
      export: {
        status: result?.exportTask?.status ?? "ready",
        signedUrl: result?.exportTask?.downloadUrl ?? null,
        sourceUrl: result?.exportTask?.sourceUrl ?? null,
        workflowId: result?.exportTask?.workflowId ?? null,
      },
    };
  }
  return workbench.api.previewExport();
}

async function clearStoryboardUploadedVideoSelection(workbench, storyboardId) {
  if (!storyboardId) {
    return;
  }

  const storyboard = getActiveStoryboards(workbench).find((item) => item.id === storyboardId);
  if (!storyboard?.selectedUploadedVideoId) {
    return;
  }

  const applyLocalClear = () => {
    updateStoryboardById(workbench, storyboardId, (currentStoryboard) => {
      if (!currentStoryboard.selectedUploadedVideoId) {
        return currentStoryboard;
      }
      const nextStoryboard = {
        ...currentStoryboard,
        selectedUploadedVideoId: null,
        previewVideo: null,
        previewThumbnailUrl: null,
        currentVideoAssetVersionId: null,
      };
      return {
        ...nextStoryboard,
        previewUrl: resolveStoryboardCombinedPreviewUrl(nextStoryboard),
      };
    });
  };

  if (storyboard.linkedShotId) {
    await runAction(workbench, "姝ｅ湪鍙栨秷鍒嗛暅瑙嗛閫夋嫨...", async () => {
      await workbench.api.updateShot({
        shotId: storyboard.linkedShotId,
        currentVideoAssetVersionId: null,
      });
      applyLocalClear();
    });
    return;
  }

  applyLocalClear();
  render(workbench);
}

function updateStoryboardById(workbench, storyboardId, updater) {
  updateActiveStoryboards(workbench, (storyboard) =>
    storyboard.id === storyboardId ? updater(storyboard) : storyboard,
  );
}

async function ensureStoryboardShot(workbench, storyboardId) {
  const storyboard = getActiveStoryboards(workbench).find((item) => item.id === storyboardId);
  if (!storyboard || storyboard.linkedShotId || !workbench.state?.project?.id) {
    return storyboard ?? null;
  }

  const episodeId =
    workbench.ui.projectPanelMode === "episode-workbench"
      ? workbench.ui.selectedEpisodeId ?? "episode-primary"
      : "episode-primary";
  const existing = getEpisodeStoryboards(workbench, episodeId);
  const nextIndex =
    existing.find((item) => item.id === storyboardId)?.index ??
    existing.length + 1;
  const result = await workbench.api.createShot({
    episodeId: episodeId === "episode-primary" ? null : episodeId,
    title: storyboard.title || String(nextIndex),
    description: storyboard.description || "",
  });
  updateStoryboardById(workbench, storyboardId, (currentStoryboard) => ({
    ...currentStoryboard,
    id: result.shot?.id ? `storyboard-${result.shot.id}` : currentStoryboard.id,
    linkedShotId: result.shot?.id ?? currentStoryboard.linkedShotId ?? null,
    title: result.shot?.title ?? currentStoryboard.title,
    description: result.shot?.description ?? currentStoryboard.description,
  }));
  if (workbench.ui.selectedStoryboardId === storyboardId && result.shot?.id) {
    workbench.ui.selectedStoryboardId = `storyboard-${result.shot.id}`;
  }
  if (result.shot) {
    workbench.state = {
      ...(workbench.state ?? {}),
      shots: [...(workbench.state?.shots ?? []), result.shot],
    };
  }
  return getActiveStoryboards(workbench).find((item) => item.linkedShotId === result.shot?.id) ?? storyboard;
}

function applyPostRenderEffects(workbench) {
  const episodeWorkbenchScrollTarget = workbench.ui.episodeWorkbenchScrollTarget ?? null;
  if (
    episodeWorkbenchScrollTarget &&
    workbench.ui.projectPanelMode === "episode-workbench" &&
    (workbench.ui.museScopeMode ?? "assets") === "assets"
  ) {
    const scrollContainer = workbench.root.querySelector(".episode-replica-asset-sections");
    const targetSection = workbench.root.querySelector(
      `[data-asset-section="${escapeAttributeSelector(episodeWorkbenchScrollTarget)}"]`,
    );
    if (scrollContainer && targetSection) {
      const offsetTop = targetSection.offsetTop - scrollContainer.offsetTop;
      scrollContainer.scrollTo({
        top: Math.max(0, offsetTop),
        behavior: "smooth",
      });
    }
    workbench.ui.episodeWorkbenchScrollTarget = null;
  }

  const pendingIds = workbench.ui.assetLibraryPendingFocusAssetIds ?? [];
  if (!pendingIds.length) {
    return;
  }
  if (workbench.ui.projectPanelMode !== "workspace" || workbench.ui.projectInteriorSection !== "assets") {
    return;
  }

  const focusTarget = pendingIds
    .map((assetId) => workbench.root.querySelector(`[data-imported-asset-id="${escapeAttributeSelector(assetId)}"]`))
    .find(Boolean);

  if (!focusTarget) {
    return;
  }

  focusTarget.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
  focusTarget.focus({ preventScroll: true });
  workbench.ui.assetLibraryPendingFocusAssetIds = [];
}

function updateStoryboardVideoById(workbench, storyboardId, videoId, updater) {
  updateStoryboardById(workbench, storyboardId, (storyboard) => ({
    ...storyboard,
    uploadedVideos: (storyboard.uploadedVideos ?? []).map((video) =>
      video.id === videoId ? updater(video) : video,
    ),
    selectedUploadedVideoId: storyboard.selectedUploadedVideoId ?? null,
  }));
}

function updateActiveStoryboards(workbench, updater) {
  const scopedUpdate = applyStoryboardScopeUpdate(
    {
      storyboards: workbench.ui.storyboards ?? [],
      episodeStoryboardMap: workbench.ui.episodeStoryboardMap ?? {},
      projectPanelMode: workbench.ui.projectPanelMode ?? "library",
      selectedEpisodeId: workbench.ui.selectedEpisodeId ?? null,
    },
    updater,
  );
  workbench.ui.storyboards = scopedUpdate.storyboards;
  workbench.ui.episodeStoryboardMap = scopedUpdate.episodeStoryboardMap;
  syncSelectedStoryboardId(workbench, scopedUpdate.activeStoryboards);
  workbench.ui.selectedStoryboard = getSelectedStoryboard(
    scopedUpdate.activeStoryboards,
    workbench.ui.selectedStoryboardId,
  );
}

function hydrateVideoDurationLabel(workbench, storyboardId, videoId, src) {
  const probe = document.createElement("video");
  probe.preload = "metadata";
  probe.src = src;
  probe.muted = true;
  probe.onloadedmetadata = () => {
    updateStoryboardVideoById(workbench, storyboardId, videoId, (video) => ({
      ...video,
      durationLabel: formatDurationLabel(probe.duration),
    }));
    render(workbench);
  };
}

async function hydrateStoryboardVideoPreview(workbench, storyboardId, videoId, src) {
  hydrateVideoDurationLabel(workbench, storyboardId, videoId, src);
  const thumbnailSrc = await captureVideoThumbnail(src, 2500);
  if (!thumbnailSrc) {
    return;
  }

  updateStoryboardVideoById(workbench, storyboardId, videoId, (video) => ({
    ...video,
    thumbnailSrc,
  }));
  updateStoryboardById(workbench, storyboardId, (storyboard) => ({
    ...storyboard,
    previewThumbnailUrl:
      storyboard.selectedUploadedVideoId === videoId
        ? thumbnailSrc
        : storyboard.previewThumbnailUrl ?? null,
  }));
  render(workbench);
}

function formatDurationLabel(value) {
  const safeSeconds = Math.max(0, Math.round(Number.isFinite(value) ? value : 10));
  const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, "0");
  const seconds = String(safeSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatDurationLabelFromMs(value) {
  return formatDurationLabel(Number(value ?? 10_000) / 1000);
}

async function captureVideoThumbnail(src, timeoutMs = 2500) {
  if (typeof document === "undefined") {
    return null;
  }

  return new Promise((resolve) => {
    const probe = document.createElement("video");
    probe.preload = "auto";
    probe.src = src;
    probe.muted = true;
    probe.playsInline = true;
    probe.crossOrigin = "anonymous";
    let settled = false;
    let timeoutId = null;

    const settle = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(value);
    };

    const cleanup = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      probe.onloadeddata = null;
      probe.onerror = null;
      probe.pause();
      probe.removeAttribute("src");
      probe.load();
    };

    timeoutId = window.setTimeout(() => settle(null), timeoutMs);

    probe.onloadeddata = () => {
      try {
        const canvas = document.createElement("canvas");
        const width = probe.videoWidth || 320;
        const height = probe.videoHeight || 180;
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          settle(null);
          return;
        }
        context.drawImage(probe, 0, 0, width, height);
        const thumbnailSrc = canvas.toDataURL("image/jpeg", 0.82);
        settle(thumbnailSrc);
      } catch (_error) {
        settle(null);
      }
    };

    probe.onerror = () => {
      settle(null);
    };
  });
}

function buildAssetImportDraft(assetKind, index) {
  const createdAt = Date.now() + index;
  const labelMap = {
    character: "角色素材",
    scene: "场景素材",
    prop: "道具素材",
    other: "Seedance 2.0",
  };
  const previewMap = {
    character:
      "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 240'%3E%3Crect width='240' height='240' rx='24' fill='%23282636'/%3E%3Crect x='56' y='24' width='44' height='188' rx='20' fill='%23f2f4fa'/%3E%3Crect x='118' y='28' width='56' height='180' rx='24' fill='%23d8dce7'/%3E%3Ccircle cx='150' cy='56' r='22' fill='%23171920'/%3E%3Crect x='126' y='80' width='50' height='64' rx='18' fill='%2322262f'/%3E%3Crect x='58' y='40' width='36' height='44' rx='18' fill='%23181b23'/%3E%3C/svg%3E",
    scene:
      "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 240'%3E%3Crect width='240' height='240' rx='24' fill='%23181922'/%3E%3Crect x='0' y='110' width='240' height='130' fill='%23222531'/%3E%3Cpath d='M0 120 72 58l44 36 26-18 38 28 60-52v188H0Z' fill='%2344495d'/%3E%3Ccircle cx='170' cy='64' r='18' fill='%23d5d8ef'/%3E%3C/svg%3E",
    prop:
      "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 240'%3E%3Crect width='240' height='240' rx='24' fill='%23efeff2'/%3E%3Cpath d='m40 156 54-64 64-22 40 22-20 60-56 44Z' fill='%23191b22'/%3E%3Cpath d='m58 150 44-50 52-18 30 16-14 42-48 36Z' fill='none' stroke='%23ff4f4f' stroke-width='8' stroke-linecap='round'/%3E%3C/svg%3E",
    other:
      "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 240'%3E%3Crect width='240' height='240' rx='24' fill='%23191922'/%3E%3Crect x='32' y='44' width='176' height='124' rx='18' fill='%232d3141'/%3E%3Cpolygon points='98,88 160,120 98,152' fill='%23ffffff'/%3E%3C/svg%3E",
  };

  return {
    id: `asset-draft-${assetKind}-${createdAt}`,
    name: labelMap[assetKind] ?? "New Asset",
    preview: previewMap[assetKind] ?? previewMap.character,
    description: "",
    createdAt,
  };
}

async function buildAssetImportDraftFromFile(workbench, assetKind, index, file) {
  const createdAt = Date.now() + index;
  const upload = await uploadLocalFile(workbench, file, `asset-import/${assetKind}`);
  return {
    id: `asset-draft-${assetKind}-${createdAt}`,
    name: normalizeAssetImportName(file.name),
    preview: upload.publicUrl,
    description: "",
    createdAt,
    fileName: file.name,
    uploadSessionId: upload.uploadSessionId ?? null,
    storageObjectId: upload.storageObjectId ?? null,
    storageObjectKey: upload.storageObjectKey,
    sourceUrl: upload.publicUrl,
    mimeType: upload.mimeType,
  };
}

function normalizeAssetImportName(fileName) {
  const rawName = String(fileName ?? "").replace(/\.[^.]+$/, "").trim();
  return rawName || "未命名资产";
}

async function saveEpisodeAssetDescription(workbench, assetKind, assetId, value) {
  const description = String(value ?? "").trim();
  const currentAssets = assetKind === "other"
    ? workbench.ui.importedAssets?.other?.[workbench.ui.projectOtherAssetMediaType ?? "image"] ?? []
    : workbench.ui.importedAssets?.[assetKind] ?? [];
  const targetAsset = currentAssets.find((item) => item.id === assetId) ?? null;
  if (!targetAsset) {
    return;
  }

  const applyLocal = () => {
    if (assetKind === "other") {
      const mediaType = workbench.ui.projectOtherAssetMediaType ?? "image";
      workbench.ui.importedAssets = {
        ...(workbench.ui.importedAssets ?? {}),
        other: {
          ...(workbench.ui.importedAssets?.other ?? { image: [], video: [] }),
          [mediaType]: (workbench.ui.importedAssets?.other?.[mediaType] ?? []).map((item) =>
            item.id === assetId ? { ...item, description } : item,
          ),
        },
      };
      return;
    }
    workbench.ui.importedAssets = {
      ...(workbench.ui.importedAssets ?? {}),
      [assetKind]: (workbench.ui.importedAssets?.[assetKind] ?? []).map((item) =>
        item.id === assetId ? { ...item, description } : item,
      ),
    };
  };

  applyLocal();

  if (targetAsset.assetId || isUuidLike(assetId)) {
    try {
      workbench.ui.toast = "请先选择要上传的附件。";
      workbench.ui.toast = "请先选择要上传的附件。";
    } catch (_error) {
      workbench.ui.toast = "??????????????";
    }
    workbench.ui.toast = "请先选择要上传的附件。";
    workbench.ui.toast = "请先选择要上传的附件。";
  }

  render(workbench);
}

function handleEpisodeWorkbenchAttachmentFiles(workbench, attachmentType, files) {
  void runAction(
    workbench,
    `????${attachmentType === "audio" ? "??" : "??"}??...`,
    async () => {
      const nextItems = [];
      for (const [index, file] of files.entries()) {
        const upload = await uploadLocalFile(workbench, file, `episode-attachments/${attachmentType}`);
        const bound = attachmentType === "audio"
          ? null
          : await bindEpisodeUploadIfAvailable(workbench, upload, {
              targetType: "episode",
              targetId: workbench.ui.selectedEpisodeId ?? "",
              mediaKind: "image",
              width: 1024,
              height: 1024,
            });
        nextItems.push({
          id: bound?.fileResource?.assetVersionId ?? upload.storageObjectId ?? `episode-attachment-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
          type: attachmentType === "audio" ? "audio" : "image",
          kind: attachmentType === "audio" ? "audio" : "image",
          name: normalizeAssetImportName(file.name),
          fileName: file.name,
          src: resolveApiUrl(bound?.file?.previewUrl ?? upload.publicUrl),
          preview: attachmentType === "audio" ? "" : resolveApiUrl(bound?.file?.previewUrl ?? upload.publicUrl),
          uploadSessionId: upload.uploadSessionId ?? null,
          storageObjectId: bound?.fileResource?.storageObjectId ?? upload.storageObjectId ?? null,
          assetVersionId: bound?.fileResource?.assetVersionId ?? null,
          storageObjectKey: upload.storageObjectKey ?? null,
          mimeType: upload.mimeType ?? file.type ?? null,
        });
      }
      workbench.ui.episodeWorkbenchAttachments = [
        ...nextItems,
        ...(workbench.ui.episodeWorkbenchAttachments ?? []),
      ];
      workbench.ui.episodeWorkbenchSelectedAttachmentIds = [
        ...nextItems.map((item) => item.id),
        ...(workbench.ui.episodeWorkbenchSelectedAttachmentIds ?? []).filter(
          (id) => !nextItems.some((item) => item.id === id),
        ),
      ];
      workbench.ui.toast = `??? ${nextItems.length} ?${attachmentType === "audio" ? "??" : "??"}???`;
    },
  );
}

function toggleSelection(current, value) {
  const selection = new Set(current);
  if (selection.has(value)) {
    selection.delete(value);
  } else {
    selection.add(value);
  }
  return createAssetSelectionList([...selection]);
}

function createAssetSelectionList(values) {
  return [...new Set(values)].filter(Boolean);
}

function prepareAssetLibraryReturn(workbench, { assetKind, mediaType, assetIds, count }) {
  const normalizedIds = [...new Set((assetIds ?? []).filter(Boolean))];
  const label = getAssetLibraryKindLabel(assetKind, mediaType);
  clearAssetLibraryReturnState(workbench);
  workbench.ui.projectInteriorSection = "assets";
  workbench.ui.projectAssetTab = assetKind;
  workbench.ui.projectInteriorStatusMenuOpen = false;
  workbench.ui.assetCardMenuId = null;
  workbench.ui.assetSearchQuery = "";
  workbench.ui.assetSortOrder = "desc";
  workbench.ui.assetFilterMode = "all";
  workbench.ui.assetOnlyMain = false;
  if (assetKind === "other") {
    workbench.ui.projectOtherAssetMediaType = mediaType === "image" ? "image" : "video";
  }
  workbench.ui.assetLibraryHighlightAssetIds = normalizedIds;
  workbench.ui.assetLibraryHighlightKind = assetKind;
  workbench.ui.assetLibraryHighlightMediaType = assetKind === "other" ? mediaType : "image";
  workbench.ui.assetLibraryHighlightMessage =
    count > 0
      ? `${label}??? ${count} ???????????`
      : `??? ${label} ????`;
  workbench.ui.assetLibraryPendingFocusAssetIds = normalizedIds;
  workbench.ui.toast =
    count > 0
      ? `${label}??? ${count} ???????????`
      : `??? ${label} ????`;
}

function clearAssetLibraryReturnState(workbench) {
  workbench.ui.assetLibraryHighlightAssetIds = [];
  workbench.ui.assetLibraryHighlightKind = null;
  workbench.ui.assetLibraryHighlightMediaType = null;
  workbench.ui.assetLibraryHighlightMessage = "";
  workbench.ui.assetLibraryPendingFocusAssetIds = [];
}

function getAssetLibraryKindLabel(assetKind, mediaType = "image") {
  if (assetKind === "other") {
    return mediaType === "video" ? "????" : "????";
  }
  return (
    {
      character: "??",
      scene: "??",
      prop: "??",
    }[assetKind] ?? "??"
  );
}

function triggerBrowserDownload(url, fileName) {
  if (typeof document === "undefined" || !url) {
    return;
  }
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName || "";
  link.target = "_blank";
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function normalizeDownloadName(baseName, url) {
  const normalizedBaseName = String(baseName ?? "").trim() || "generated-asset";
  const extensionMatch = String(url ?? "").match(/\.([a-z0-9]+)(?:[?#]|$)/i);
  const extension = extensionMatch?.[1] ? `.${extensionMatch[1]}` : "";
  return `${normalizedBaseName}${extension}`;
}

function escapeAttributeSelector(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function findImportedAsset(importedAssets, assetKind, mediaType, assetId) {
  return getImportedAssetBucket(importedAssets, assetKind, mediaType).find((item) => item.id === assetId) ?? null;
}

function findAssetForReference(workbench, role) {
  const assetsByType = workbench.ui.projectDetail?.assetsByType ?? {};
  if (role === "character" || role === "locked_character") {
    return assetsByType.character?.[0] ?? null;
  }
  if (role === "scene") {
    return assetsByType.scene?.[0] ?? null;
  }
  if (role === "prop") {
    return assetsByType.prop?.[0] ?? null;
  }
  if (role === "reference_video" || role === "source_video") {
    return assetsByType.other?.video?.[0] ?? null;
  }
  return assetsByType.other?.image?.[0] ?? null;
}

function cloneImportedAssets(importedAssets) {
  return {
    character: [...(importedAssets?.character ?? [])],
    scene: [...(importedAssets?.scene ?? [])],
    prop: [...(importedAssets?.prop ?? [])],
    other: {
      image: [...(importedAssets?.other?.image ?? [])],
      video: [...(importedAssets?.other?.video ?? [])],
    },
  };
}

function getImportedAssetBucket(importedAssets, assetKind, otherMediaType = "video") {
  if (assetKind === "other") {
    return importedAssets?.other?.[otherMediaType] ?? [];
  }
  return importedAssets?.[assetKind] ?? [];
}

function assignImportedAssets(importedAssets, assetKind, otherMediaType, items) {
  if (assetKind === "other") {
    importedAssets.other[otherMediaType] = items;
    return;
  }
  importedAssets[assetKind] = items;
}

function mapImportedAssets(importedAssets, assetKind, otherMediaType, mapper) {
  const nextAssets = cloneImportedAssets(importedAssets);
  assignImportedAssets(
    nextAssets,
    assetKind,
    otherMediaType,
    getImportedAssetBucket(nextAssets, assetKind, otherMediaType).map(mapper),
  );
  return nextAssets;
}

function triggerAssetDownload(url, fileName, extension) {
  const link = document.createElement("a");
  const safeName = String(fileName ?? "asset").trim() || "asset";
  link.href = url;
  link.download = `${safeName}.${extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function findStoryboardImage(storyboard, imageId = "") {
  const uploadedImages = Array.isArray(storyboard?.uploadedImages) ? storyboard.uploadedImages : [];
  if (imageId) {
    return uploadedImages.find((image) => image.id === imageId) ?? null;
  }
  return (
    uploadedImages.find((image) => image.id === storyboard?.currentImageAssetVersionId) ??
    (storyboard?.previewImageUrl
      ? {
          id: storyboard.currentImageAssetVersionId ?? "current-image",
          fileName: storyboard.uploadedImageName || storyboard.title || "storyboard-image",
          src: storyboard.previewImageUrl,
        }
      : null)
  );
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value ?? "").trim(),
  );
}

function resolveStoryboardImageAssetVersionId(workbench, storyboard, image, imageId = "") {
  const uploadedImages = Array.isArray(storyboard?.uploadedImages) ? storyboard.uploadedImages : [];
  const requestedImage = uploadedImages.find((item) => item.id === imageId) ?? image ?? null;
  if (requestedImage?.deleteAssetId && requestedImage.deleteAssetId === requestedImage.id && isUuidLike(requestedImage.deleteAssetId)) {
    return requestedImage.deleteAssetId;
  }
  const linkedShotId = storyboard?.linkedShotId ?? null;
  if (linkedShotId && workbench?.state) {
    const rawShot =
      (Array.isArray(workbench.state.projectDetail?.shots) ? workbench.state.projectDetail.shots : []).find(
        (shot) => shot.id === linkedShotId,
      ) ??
      (Array.isArray(workbench.state.shots) ? workbench.state.shots : []).find(
        (shot) => shot.id === linkedShotId,
      ) ??
      null;
    const rawImageVersions = Array.isArray(rawShot?.imageVersions) ? rawShot.imageVersions : [];
    const rawSourceMatches = requestedImage?.src
      ? rawImageVersions.filter(
          (version) =>
            resolveApiUrl(
              version.previewUrl ??
                version.sourceUrl ??
                version.metadata?.previewUrl ??
                version.metadata?.sourceUrl ??
                version.storageObjectKey ??
                "",
            ) === requestedImage.src,
        )
      : [];
    const rawMatch =
      rawImageVersions.find((version) => version.id === requestedImage?.id) ??
      rawImageVersions.find((version) => version.id === imageId) ??
      (rawSourceMatches.length === 1 ? rawSourceMatches[0] : null) ??
      null;
    if (rawMatch?.id && isUuidLike(rawMatch.id)) {
      return rawMatch.id;
    }
  }
  const directCandidates = [
    requestedImage?.id,
    imageId,
    storyboard?.currentImageAssetVersionId,
  ].filter((value) => isUuidLike(value));

  if (directCandidates.length) {
    return directCandidates[0];
  }

  if (
    storyboard?.previewImageUrl &&
    requestedImage?.src === storyboard.previewImageUrl &&
    isUuidLike(storyboard.currentImageAssetVersionId)
  ) {
    return storyboard.currentImageAssetVersionId;
  }

  return null;
}

function downloadStoryboardImage(workbench, storyboardId, imageId = "") {
  const storyboard = getActiveStoryboards(workbench).find((item) => item.id === storyboardId);
  const image = findStoryboardImage(storyboard, imageId);
  if (!image?.src || !image?.id) {
    workbench.ui.toast = "?????????????";
    return;
  }

  triggerAssetDownload(
    image.src,
    stripFileExtension(image.fileName || storyboard?.title || "storyboard-image"),
    inferFileExtension(image.fileName || image.src, "png"),
  );
  workbench.ui.toast = `????? ${image.fileName || storyboard.uploadedImageName || "????"}?`;
}

function legacyDeleteStoryboardImage(workbench, storyboardId, imageId = "") {
  const storyboard = getActiveStoryboards(workbench).find((item) => item.id === storyboardId);
  const image = findStoryboardImage(storyboard, imageId);
  if (!image?.src || !image?.id) {
    workbench.ui.toast = "?????????????";
    return;
  }

  const resolvedAssetVersionId = resolveStoryboardImageAssetVersionId(workbench, storyboard, image, imageId);
  const removedUrl = image.src;
  updateStoryboardById(workbench, storyboardId, (currentStoryboard) => ({
    ...currentStoryboard,
    imageStatus: "empty",
    previewImageUrl: null,
    previewUrl: null,
    uploadedImageName: "",
    currentImageAssetVersionId: null,
  }));
  updateStoryboardGenerationState(workbench, storyboardId, (state) => ({
    ...state,
    firstFrame: state.firstFrame?.url === removedUrl ? null : state.firstFrame,
    lastFrame: state.lastFrame?.url === removedUrl ? null : state.lastFrame,
    imageReference: state.imageReference?.url === removedUrl ? null : state.imageReference,
  }));
  clearStoryboardImageFromState(workbench, storyboard?.linkedShotId ?? null);
  workbench.ui.toast = "??????????";
}

function downloadStoryboardVideo(workbench, storyboardId, videoId) {
  const storyboard = getActiveStoryboards(workbench).find((item) => item.id === storyboardId);
  const video = (storyboard?.uploadedVideos ?? []).find((item) => item.id === videoId && item.src);
  if (!video?.src) {
    workbench.ui.toast = "?????????????";
    return;
  }

  triggerAssetDownload(
    video.src,
    stripFileExtension(video.fileName || `${storyboard?.title || "storyboard-video"}`),
    inferFileExtension(video.fileName || video.src, "mp4"),
  );
  workbench.ui.toast = `????? ${video.fileName || "????"}?`;
}

function legacyDeleteStoryboardVideo(workbench, storyboardId, videoId) {
  if (!storyboardId || !videoId) {
    return;
  }

  const storyboard = getActiveStoryboards(workbench).find((item) => item.id === storyboardId);
  const video = (storyboard?.uploadedVideos ?? []).find((item) => item.id === videoId);
  if (!video) {
    workbench.ui.toast = "?????????????";
    return;
  }

  cancelStoryboardVideoUpload(workbench, storyboardId, videoId);
  clearStoryboardVideoFromState(workbench, storyboard?.linkedShotId ?? null, videoId);
  workbench.ui.toast = `??? ${video.fileName || "????"}?`;
}

function clearStoryboardImageFromState(workbench, linkedShotId, imageId, nextSelectedImage = null) {
  if (!linkedShotId || !workbench.state) {
    return;
  }

  const clearShotImage = (shot) => {
    if (shot.id !== linkedShotId) {
      return shot;
    }

    const nextImageVersions = Array.isArray(shot.imageVersions)
      ? shot.imageVersions.filter((item) => item.id !== imageId)
      : shot.imageVersions;
    const removedSelected = shot.currentImageAssetVersionId === imageId;
    return {
      ...shot,
      imageVersions: nextImageVersions,
      currentImageAssetVersionId:
        removedSelected ? (nextSelectedImage?.id ?? null) : shot.currentImageAssetVersionId,
      previewImageUrl:
        removedSelected ? (nextSelectedImage?.src ?? null) : shot.previewImageUrl ?? null,
      previewUrl: removedSelected ? (nextSelectedImage?.src ?? null) : shot.previewUrl ?? null,
    };
  };

  if (Array.isArray(workbench.state.shots)) {
    workbench.state.shots = workbench.state.shots.map(clearShotImage);
  }

  if (Array.isArray(workbench.state.projectDetail?.shots)) {
    workbench.state.projectDetail.shots = workbench.state.projectDetail.shots.map(clearShotImage);
  }
}

function clearStoryboardVideoFromState(workbench, linkedShotId, videoId) {
  if (!linkedShotId || !workbench.state) {
    return;
  }

  const clearShotVideo = (shot) => {
    if (shot.id !== linkedShotId) {
      return shot;
    }
    const nextVideoVersions = Array.isArray(shot.videoVersions)
      ? shot.videoVersions.filter((item) => item.id !== videoId)
      : shot.videoVersions;
    const removedSelected = shot.currentVideoAssetVersionId === videoId;
    return {
      ...shot,
      videoVersions: nextVideoVersions,
      currentVideoAssetVersionId: removedSelected ? null : shot.currentVideoAssetVersionId,
      previewVideoUrl: removedSelected ? null : shot.previewVideoUrl ?? null,
      previewUrl: removedSelected ? shot.previewImageUrl ?? null : shot.previewUrl ?? null,
    };
  };

  if (Array.isArray(workbench.state.shots)) {
    workbench.state.shots = workbench.state.shots.map(clearShotVideo);
  }

  if (Array.isArray(workbench.state.projectDetail?.shots)) {
    workbench.state.projectDetail.shots = workbench.state.projectDetail.shots.map(clearShotVideo);
  }
}

function isStoryboardVideoProtected(storyboard, videoId) {
  if (!storyboard || !videoId) {
    return false;
  }

  return storyboard.selectedUploadedVideoId === videoId;
}

async function deleteStoryboardVideoStable(workbench, storyboardId, videoId) {
  if (!storyboardId || !videoId) {
    return;
  }

  const storyboard = getActiveStoryboards(workbench).find((item) => item.id === storyboardId);
  if (isStoryboardVideoProtected(storyboard, videoId)) {
    workbench.ui.toast = "?????????????";
    render(workbench);
    return;
  }

  const video = (storyboard?.uploadedVideos ?? []).find((item) => item.id === videoId);
  if (!video) {
    workbench.ui.toast = "?????????????";
    render(workbench);
    return;
  }

  const applyLocalRemoval = () => {
    cancelStoryboardVideoUpload(workbench, storyboardId, videoId);
    updateStoryboardById(workbench, storyboardId, (currentStoryboard) => {
      const remainingVideos = (currentStoryboard.uploadedVideos ?? []).filter((item) => item.id !== videoId);
      const nextSelectedVideo =
        remainingVideos.find((item) => item.id === currentStoryboard.selectedUploadedVideoId && item.status === "ready") ??
        remainingVideos.find((item) => item.status === "ready") ??
        null;
      const nextStoryboard = {
        ...currentStoryboard,
        uploadedVideos: remainingVideos,
        selectedUploadedVideoId: nextSelectedVideo?.id ?? null,
        videoStatus: nextSelectedVideo ? "ready" : "empty",
        previewVideo: nextSelectedVideo?.src ?? null,
        previewThumbnailUrl: nextSelectedVideo?.thumbnailSrc ?? null,
        currentVideoAssetVersionId:
          currentStoryboard.currentVideoAssetVersionId === videoId
            ? nextSelectedVideo?.id ?? null
            : currentStoryboard.currentVideoAssetVersionId,
      };
      return {
        ...nextStoryboard,
        previewUrl: resolveStoryboardCombinedPreviewUrl(nextStoryboard),
      };
    });
    clearStoryboardVideoFromState(workbench, storyboard?.linkedShotId ?? null, videoId);
  };

  if (storyboard.linkedShotId) {
    workbench.ui.busy = true;
    workbench.ui.toast = "濮濓絽婀崚鐘绘珟閸掑棝鏆呯憴鍡涱暥...";
    render(workbench);
    try {
      const result = await workbench.api.deleteShotMedia(storyboard.linkedShotId, {
        kind: "video",
        assetVersionId: videoId,
      });
      applyLocalRemoval();
      if (result?.missing) {
        persistWorkbenchState(workbench);
        workbench.ui.toast = "?????????????????????";
        return;
      }
      await refresh(workbench);
      workbench.ui.toast = "??????????";
    } catch (error) {
      workbench.ui.toast = `閸掔娀娅庢径杈Е閿?{friendlyError(error)}`;
    } finally {
      workbench.ui.busy = false;
      render(workbench);
    }
    return;
  }

  applyLocalRemoval();
  persistWorkbenchState(workbench);
  workbench.ui.toast = `??? ${video.fileName || "????"}?`;
  render(workbench);
}

async function deleteEpisodeFileResourceIfAvailable(workbench, item) {
  const fileId = item?.storageObjectId ?? item?.fileId ?? item?.id ?? "";
  if (
    !isRealEpisodeWorkbench(workbench) ||
    typeof workbench.api.deleteFileResource !== "function" ||
    !isUuidLike(fileId)
  ) {
    return null;
  }
  return workbench.api.deleteFileResource(workbench.ui.selectedEpisodeId, fileId, {
    assetVersionId: item?.assetVersionId ?? item?.id ?? null,
    storageObjectId: item?.storageObjectId ?? null,
  });
}

function inferFileExtension(value, fallback = "png") {
  const normalized = String(value ?? "");
  const match = normalized.match(/\.([a-z0-9]+)(?:\?|#|$)/i);
  return match?.[1]?.toLowerCase() ?? fallback;
}

function stripFileExtension(value) {
  return String(value ?? "").replace(/\.[a-z0-9]+$/i, "") || "asset";
}

function createImportedAssetFromDraft(assetKind, draft) {
  return {
    id: `imported-${draft.id}`,
    name: draft.name?.trim() || "未命名资产",
    preview: draft.preview,
    kind: assetKind,
    source: "local",
  };
}

function createImportedAssetFromRecord(assetKind, asset) {
  return {
    id: `imported-${asset.id}`,
    name: asset.name,
    preview: asset.preview,
    description: asset.description ?? "",
    kind: assetKind,
    source: "official",
  };
}

function getOfficialAssetRecords(assetKind, category = "domestic-modern-city") {
  const assetCatalog = {
    character: [
      { id: "official-character-1", name: "白发主角", preview: buildColorAssetPreview("#f2f3f8", "#11161f") },
      { id: "official-character-2", name: "流浪少女", preview: buildColorAssetPreview("#efe5d8", "#26262e") },
      { id: "official-character-3", name: "调查员", preview: buildColorAssetPreview("#dde5f2", "#49526a") },
      { id: "official-character-4", name: "机械师", preview: buildColorAssetPreview("#f3f2f7", "#6a617f") },
    ],
    scene: [
      { id: "official-scene-1", name: "北城废墟", preview: buildScenePreview("#263141", "#5a6d93") },
      { id: "official-scene-2", name: "办公园区", preview: buildScenePreview("#2c3038", "#858ca0") },
      { id: "official-scene-3", name: "会客室", preview: buildScenePreview("#2f2a28", "#8f7358") },
      { id: "official-scene-4", name: "夜色街口", preview: buildScenePreview("#161c30", "#4b76bf") },
    ],
    prop: [
      { id: "official-prop-1", name: "手术刀", preview: buildPropPreview("#f0f1f4", "#1a1d24") },
      { id: "official-prop-2", name: "通行证", preview: buildPropPreview("#eff1f6", "#6a7480") },
      { id: "official-prop-3", name: "能源枪", preview: buildPropPreview("#1d2431", "#68bbff") },
      { id: "official-prop-4", name: "机械腕表", preview: buildPropPreview("#17191f", "#8e5bff") },
    ],
    other: [
      { id: `official-other-${category}-1`, name: "Seedance 2.0 参考视频", preview: buildVideoPreview("#242635", "#ffffff") },
      { id: `official-other-${category}-2`, name: "角色参考片段", preview: buildVideoPreview("#202433", "#d8dff5") },
      { id: `official-other-${category}-3`, name: "参考图", preview: buildColorAssetPreview("#f6f6f9", "#35384a") },
      { id: `official-other-${category}-4`, name: "场景参考图", preview: buildScenePreview("#27303f", "#64758d") },
    ],
  };

  return assetCatalog[assetKind] ?? assetCatalog.character;
}
function buildColorAssetPreview(background, accent) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
      <rect width="240" height="240" rx="24" fill="${background}"/>
      <circle cx="118" cy="58" r="24" fill="${accent}"/>
      <rect x="88" y="86" width="60" height="88" rx="24" fill="${accent}"/>
      <rect x="56" y="90" width="28" height="78" rx="14" fill="${accent}" opacity="0.88"/>
      <rect x="154" y="90" width="28" height="78" rx="14" fill="${accent}" opacity="0.88"/>
    </svg>
  `)}`;
}

function buildScenePreview(top, bottom) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
      <rect width="240" height="240" rx="24" fill="${top}"/>
      <rect y="110" width="240" height="130" fill="${bottom}"/>
      <path d="M0 132 58 82l40 22 34-14 40 34 68-52v168H0Z" fill="rgba(255,255,255,0.18)"/>
    </svg>
  `)}`;
}

function buildPropPreview(background, accent) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
      <rect width="240" height="240" rx="24" fill="${background}"/>
      <path d="m38 156 62-72 66-20 36 28-20 56-50 42Z" fill="${accent}"/>
      <path d="m54 148 42-46 58-20 26 20-12 28-42 30Z" fill="none" stroke="rgba(255,80,80,0.85)" stroke-width="7" stroke-linecap="round"/>
    </svg>
  `)}`;
}

function buildVideoPreview(background, accent) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
      <rect width="240" height="240" rx="24" fill="${background}"/>
      <rect x="30" y="44" width="180" height="124" rx="18" fill="rgba(255,255,255,0.08)"/>
      <polygon points="102,86 158,118 102,150" fill="${accent}"/>
    </svg>
  `)}`;
}

function buildCustomEpisode(title) {
  const createdAtMs = Date.now();
  return {
    id: `episode-${createdAtMs}`,
    title,
    status: "草稿",
    createdAt: formatEpisodeDate(createdAtMs),
    createdAtMs,
    storyboardCount: 0,
  };
}

function createEpisodeEntryList(episodes) {
  return [...episodes].sort(
    (left, right) => getEpisodeTimestamp(right) - getEpisodeTimestamp(left),
  );
}

function getEpisodeTimestamp(episode) {
  if (typeof episode?.createdAtMs === "number" && Number.isFinite(episode.createdAtMs)) {
    return episode.createdAtMs;
  }
  const parsed = Date.parse(String(episode?.createdAt ?? "").replace(/\./g, "/"));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getNextEpisodeTitle(episodes) {
  const nextIndex = (Array.isArray(episodes) ? episodes.length : 0) + 1;
  return nextIndex === 1 ? "? 1 ?" : `? ${nextIndex} ?`;
}

function buildSingleEpisodeTitle(scriptText, episodes) {
  const normalized = String(scriptText ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (!normalized) {
    return getNextEpisodeTitle(episodes);
  }

  const candidate = normalized.replace(/[闂侀潧妫楅崑濠勬閹烘鏅??,闂佹寧绋戦惌澶屾?闂?]+$/g, "").trim();
  if (!candidate) {
    return getNextEpisodeTitle(episodes);
  }

  return [...candidate].slice(0, 24).join("");
}

function formatEpisodeDate(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

function statusForAction(action) {
  return (
    {
      "create-project": "正在创建项目...",
      "parse-script": "正在解析剧本...",
      "confirm-all-assets": "正在确认全部资产...",
      "confirm-asset": "正在确认资产...",
      "edit-asset": "正在保存资产编辑...",
      "run-calibration": "正在执行校准...",
      "generate-images": "正在生成图片...",
      "generate-videos": "正在生成视频...",
      "smart-generate": "正在执行智能生成...",
      "preview-export": "正在准备导出预览...",
    }[action] ?? "处理中..."
  );
}

export function friendlyError(error) {
  const status = Number(error?.status ?? 0);
  const errorCode = String(error?.errorCode ?? "");
  const requestId = error?.requestId ? ` (request ${error.requestId})` : "";
  if (errorCode === "origin_forbidden") {
    return `跨域来源被拒绝，请从允许的地址打开页面或检查 CORS 配置${requestId}`;
  }
  if (errorCode === "permission_denied" || status === 403) {
    return `没有权限执行该操作，请确认账号、项目成员角色或联系管理员${requestId}`;
  }
  if (status === 401 || errorCode === "unauthenticated") {
    return `登录已过期，请重新登录${requestId}`;
  }
  if (status === 404 && errorCode === "resource_not_found") {
    return `资源不存在或无权访问，请刷新项目后重试${requestId}`;
  }
  const message = error instanceof Error ? error.message : String(error);
  return (
    {
      creator_project_missing: "Please upload a script and create a project first.",
      creator_shots_missing: "Please split the storyboard into shots first.",
      asset_review_not_ready: "Please confirm the required assets first.",
      image_assets_missing: "Some storyboard shots are still missing image assets.",
      script_not_ready: "The script is not ready yet. Upload or save it first.",
      script_not_parsed: "The script has not finished parsing yet.",
      project_not_editable: "The current project status does not allow generation yet.",
      project_not_found: "The current project no longer exists. Refresh and try again.",
    }[message] ?? `${message}${requestId}`
  );
}

function resolveEventElement(target) {
  if (target instanceof Element) {
    return target;
  }
  if (target instanceof Node) {
    return target.parentElement;
  }
  return null;
}

function findScopedInput(root, trigger, selector) {
  const scopes = [
    trigger?.closest?.("[data-upload-panel]"),
    trigger?.closest?.(".console-block"),
    trigger?.closest?.(".stage-video-library"),
    trigger?.closest?.(".stage-image-library"),
    trigger?.closest?.(".cinematic-stage-empty"),
    trigger?.closest?.(".project-gallery-poster"),
    root,
  ].filter(Boolean);

  for (const scope of scopes) {
    const match = scope.querySelector(selector);
    if (match) {
      return match;
    }
  }

  return null;
}

export function findProjectCoverInput(root, projectId) {
  if (!projectId) {
    return null;
  }
  return root.querySelector(
    `input[data-action="upload-project-cover"][data-project-id="${projectId}"]`,
  );
}

function getInputValue(root, selector, fallback) {
  const value = root.querySelector(selector)?.value?.trim();
  return value || fallback;
}

function getCheckedValue(root, selector, fallback) {
  return root.querySelector(`${selector}:checked`)?.value ?? fallback;
}

function updateOriginalScriptSubmitState(workbench) {
  const draft = workbench.ui.originalScriptDraft;
  const submit = workbench.root.querySelector('[data-action="submit-original-script-settings"]');
  if (!submit) {
    return;
  }

  submit.disabled = !(
    draft.fileName?.trim() &&
    draft.inspiration?.trim() &&
    draft.episodeCount
  );
}

function deriveInitialNavTab(hash) {
  const token = String(hash || "").replace(/^#/, "");
  if (!token) {
    return "project";
  }
  if (parseEpisodeRouteToken(token) || parseProjectRouteToken(token)) {
    return "project";
  }
  if (token === "home") {
    return "home";
  }
  if (
    token === "asset-prep-section" ||
    token === "project-workspace" ||
    token === "storyboard-workbench" ||
    token === "episode-workbench" ||
    token === "project"
  ) {
    return "project";
  }
  if (token === "script") {
    return "script";
  }
  if (token === "library") {
    return "library";
  }
  if (token === "tools") {
    return "tools";
  }
  if (token === "team" || token === "team-dashboard") {
    return "team";
  }
  return "project";
}

function deriveInitialLibraryTeamRoute(hash) {
  const token = String(hash || "").replace(/^#/, "");
  if (token === "team-dashboard") {
    return "team-dashboard";
  }
  if (token === "team") {
    return "team";
  }
  return "assets";
}

function deriveInitialProjectPanelMode(hash) {
  const token = String(hash || "").replace(/^#/, "");
  if (parseEpisodeRouteToken(token)) {
    return "episode-workbench";
  }
  if (parseProjectRouteToken(token)) {
    return "workspace";
  }
  if (token === "episode-workbench" || token === "storyboard-workbench") {
    return "episode-workbench";
  }
  if (token === "asset-prep-section" || token === "project-workspace") {
    return "workspace";
  }
  return "library";
}

function navTabLabel(tab) {
  return (
    {
      home: "首页",
      script: "剧本",
      project: "项目",
      library: "资产库",
      tools: "工具箱",
      team: "团队",
    }[tab] ?? "工作台"
  );
}

function buildProjectSeedScript({ name, projectType }) {
  const typeLabel =
    {
      "domestic-live": "Domestic Live Action",
      "overseas-live": "Overseas Live Action",
      anime: "2D/3D Anime",
    }[projectType] ?? "2D/3D Anime";

  return `${name}

Project type: ${typeLabel}
Episode 1: Generate an initial story outline that can be expanded into storyboard shots.`;
}

function applyProjectDetail(workbench, detail) {
  const normalizedDetail = normalizeProjectDetailContract(detail);
  if (!normalizedDetail?.project) {
    return;
  }
  workbench.state = {
    ...(workbench.state ?? {}),
    project: normalizedDetail.project,
    script: normalizedDetail.script ?? null,
    shots: normalizedDetail.shots ?? [],
    projectDetail: normalizedDetail,
  };
  workbench.ui.projectDetail = normalizedDetail;
  workbench.ui.exportHistory = normalizedDetail.exportHistory ?? workbench.ui.exportHistory ?? [];
  workbench.ui.importedAssets = mapProjectDetailAssets(normalizedDetail.assetsByType);
  workbench.ui.customEpisodes = getDetailEpisodes(workbench.state);
}

function normalizeProjectDetailContract(detail) {
  if (!detail || typeof detail !== "object") {
    return detail;
  }
  const project = detail.project && typeof detail.project === "object"
    ? {
        ...detail.project,
        id: detail.project.id ?? detail.project.projectId ?? null,
        projectId: detail.project.projectId ?? detail.project.id ?? null,
      }
    : detail.project;
  const episodes = Array.isArray(detail.episodes)
    ? detail.episodes.map((episode) => ({
        ...episode,
        id: episode.id ?? episode.episodeId ?? null,
        episodeId: episode.episodeId ?? episode.id ?? null,
        previewUrl: episode.previewUrl ?? episode.previewMedia?.url ?? null,
      }))
    : detail.episodes;
  return {
    ...detail,
    project,
    episodes,
  };
}

function mapEpisodeStoryboardContract(storyboard) {
  const storyboardId =
    storyboard?.id ??
    storyboard?.storyboardId ??
    storyboard?.shotId ??
    `storyboard-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const previewImageUrl =
    storyboard?.previewImageUrl ??
    storyboard?.currentImageUrl ??
    storyboard?.currentImage?.url ??
    storyboard?.imageUrl ??
    null;
  const previewVideo =
    storyboard?.previewVideo ??
    storyboard?.currentVideoUrl ??
    storyboard?.currentVideo?.url ??
    storyboard?.videoUrl ??
    null;
  return {
    id: storyboardId,
    linkedShotId: storyboard?.linkedShotId ?? storyboard?.shotId ?? storyboard?.storyboardId ?? storyboardId,
    episodeId: storyboard?.episodeId ?? null,
    index: Number(storyboard?.index ?? storyboard?.indexNo ?? storyboard?.sortOrder ?? 1),
    title: storyboard?.title ?? String(storyboard?.indexNo ?? storyboard?.sortOrder ?? 1),
    description: storyboard?.description ?? storyboard?.sceneAnalysis ?? storyboard?.plotPreview ?? "",
    sceneAnalysis: storyboard?.sceneAnalysis ?? "",
    plotPreview: storyboard?.plotPreview ?? "",
    previewImageUrl,
    previewVideo,
    previewUrl: previewVideo ?? previewImageUrl,
    imageStatus: previewImageUrl ? "ready" : "empty",
    videoStatus: previewVideo ? "ready" : "empty",
    currentImageAssetVersionId: storyboard?.currentImageFileId ?? storyboard?.currentImageAssetVersionId ?? null,
    currentVideoAssetVersionId: storyboard?.currentVideoFileId ?? storyboard?.currentVideoAssetVersionId ?? null,
    uploadedImages: previewImageUrl
      ? [{ id: storyboard?.currentImageFileId ?? `${storyboardId}-image`, src: previewImageUrl, status: "ready" }]
      : [],
    uploadedVideos: previewVideo
      ? [{ id: storyboard?.currentVideoFileId ?? `${storyboardId}-video`, src: previewVideo, status: "ready" }]
      : [],
    generationState: createEmptyGenerationState(),
  };
}

function mapEpisodeAssetContracts(assets = [], kind) {
  return [...assets].map((asset) => ({
    id: asset?.assetId ?? asset?.id ?? `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    assetId: asset?.assetId ?? asset?.id ?? null,
    name: asset?.name ?? asset?.label ?? "未命名资产",
    preview: asset?.fixedImageUrl ?? asset?.previewUrl ?? "",
    previewUrl: asset?.fixedImageUrl ?? asset?.previewUrl ?? "",
    description: asset?.description ?? "",
    kind,
    source: "episode",
    assetSource: "episode",
    voiceId: asset?.voiceId ?? null,
    updatedAt: asset?.updatedAt ?? null,
    fixedImageFileId: asset?.fixedImageFileId ?? null,
  }));
}

function mapProjectDetailAssets(assetsByType = {}) {
  return {
    character: mapProjectDetailAssetRecords(assetsByType.character, "character"),
    scene: mapProjectDetailAssetRecords(assetsByType.scene, "scene"),
    prop: mapProjectDetailAssetRecords(assetsByType.prop, "prop"),
    other: {
      image: mapProjectDetailAssetRecords(assetsByType.other?.image, "other"),
      video: mapProjectDetailAssetRecords(assetsByType.other?.video, "other"),
    },
  };
}

function mapProjectDetailAssetRecords(assets = [], kind) {
  return [...assets].map((asset) => ({
    id: asset.id,
    name: asset.label ?? asset.assetKey ?? "未命名资产",
    preview: asset.previewUrl ?? asset.latestVersion?.previewUrl ?? "",
    description: asset.latestVersion?.metadata?.description ?? asset.assetKey ?? "",
    kind,
    isMain: Boolean(asset.latestVersion?.metadata?.isMain),
    assetSource: asset.latestVersion?.metadata?.source ?? "import",
    updatedAt: asset.updatedAt ?? asset.latestVersion?.createdAt ?? asset.createdAt ?? null,
    latestVersion: asset.latestVersion ?? null,
    source: asset.latestVersion?.metadata?.source ?? "import",
  }));
}

function mapBackendAssets(assets = [], kind) {
  return [...assets].map((asset) => ({
    id: asset.id,
    name: asset.label ?? asset.assetKey ?? "未命名资产",
    preview: asset.previewUrl ?? asset.latestVersion?.previewUrl ?? "",
    description: asset.assetKey ?? "",
    kind,
    source: "backend",
  }));
}

function getDetailEpisodes(state) {
  const detailEpisodes = (state?.projectDetail?.episodes ?? []).map((episode) => ({
    id: episode.id,
    title: episode.title,
    sequence: Number(episode.sequence ?? 0),
    status: episode.status === "ready" ? "已完成" : "草稿",
    createdAt: formatProjectDate(new Date(episode.createdAt ?? Date.now())),
    createdAtMs: Date.parse(episode.createdAt ?? ""),
    storyboardCount: episode.storyboardCount ?? 0,
    previewUrl: episode.previewUrl ?? null,
  }));
  const shots = Array.isArray(state?.projectDetail?.shots)
    ? state.projectDetail.shots
    : (Array.isArray(state?.shots) ? state.shots : []);
  const hasPrimaryEpisode = detailEpisodes.some((episode) => episode.id === "episode-primary");
  const unassignedShots = shots.filter((shot) => !shot?.episodeId);
  if (!hasPrimaryEpisode && unassignedShots.length) {
    detailEpisodes.unshift({
      id: "episode-primary",
      sequence: 0,
      title: "未分配剧集",
      status: "草稿",
      createdAt: formatProjectDate(new Date(state?.projectDetail?.project?.createdAt ?? state?.project?.createdAt ?? "2026/05/22")),
      createdAtMs: Date.parse(String(state?.projectDetail?.project?.createdAt ?? state?.project?.createdAt ?? "2026/05/22")) || 0,
      storyboardCount: unassignedShots.length,
      previewUrl: null,
    });
  }
  return [...detailEpisodes].sort((left, right) => {
    const timeDelta = (Number(right.createdAtMs) || 0) - (Number(left.createdAtMs) || 0);
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

function inferMimeTypeFromDataUrl(value) {
  const match = /^data:([^;,]+)/.exec(String(value ?? ""));
  return match?.[1] ?? "image/png";
}

function extensionForMimeType(mimeType) {
  return (
    {
      "image/svg+xml": "svg",
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
      "video/mp4": "mp4",
    }[String(mimeType ?? "").toLowerCase()] ?? "bin"
  );
}

function dataUrlToFile(dataUrl, fileName) {
  const value = String(dataUrl ?? "");
  const match = /^data:([^;,]+)?((?:;[^,]+)*),(.*)$/s.exec(value);
  if (!match) {
    throw new Error("invalid_data_url");
  }
  const mimeType = match[1] ?? "application/octet-stream";
  const modifiers = match[2] ?? "";
  const payload = match[3] ?? "";
  const bytes = modifiers.includes(";base64")
    ? Uint8Array.from(atob(payload), (char) => char.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(payload));
  return new File([bytes], fileName, { type: mimeType });
}

async function buildOfficialAssetImportPayload(workbench, record, assetKind) {
  const mimeType = record.mimeType ?? inferMimeTypeFromDataUrl(record.previewDataUrl);
  const fileNameBase =
    String(record.name ?? assetKind ?? "official-asset")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "official-asset";
  const file = dataUrlToFile(
    record.previewDataUrl,
    `${fileNameBase}.${extensionForMimeType(mimeType)}`,
  );
  const upload = await uploadLocalFile(workbench, file, "official-assets");
  return {
    name: record.name,
    uploadSessionId: upload.uploadSessionId,
    storageObjectId: upload.storageObjectId,
    mimeType,
    width: record.width ?? 240,
    height: record.height ?? 240,
  };
}

async function syncProjectLibraryFromApi(workbench) {
  const payload = await workbench.api.getProjects();
  const projects = Array.isArray(payload.projects)
    ? payload.projects.map((project) => mapProjectRecordToCard(project))
    : [];
  workbench.ui.projectLibrary = projects;
  syncSelectedProjectCard(workbench, projects);
}

async function syncAssetLibraryFromApi(workbench, options = {}) {
  const scope = workbench.ui.libraryTeamAssetScope ?? "official";
  if (
    scope === "personal" ||
    typeof workbench.api.getLibraryAssets !== "function" ||
    !shouldFetchAssetLibrary(workbench)
  ) {
    workbench.ui.libraryLoading = false;
    workbench.ui.libraryError = "";
    workbench.ui.libraryAssets = [];
    return;
  }

  workbench.ui.libraryLoading = true;
  workbench.ui.libraryError = "";
  try {
    const payload = await workbench.api.getLibraryAssets({
      scope,
      category: workbench.ui.libraryCategory,
      folder: workbench.ui.libraryFolder,
      query: workbench.ui.libraryQuery,
    });
    if (options.requestId && workbench.librarySearchRequestId !== options.requestId) {
      return;
    }
    const folders = Array.isArray(payload.folders) ? payload.folders : [];
    workbench.ui.libraryCategories = Array.isArray(payload.categories) ? payload.categories : [];
    workbench.ui.libraryFolders = folders;
    workbench.ui.libraryAssets = Array.isArray(payload.assets) ? payload.assets : [];
    workbench.ui.libraryEntitlement = payload.entitlement ?? null;
    if (!workbench.ui.libraryFolder && folders[0]) {
      workbench.ui.libraryFolder = folders[0];
    }
  } catch (error) {
    if (options.requestId && workbench.librarySearchRequestId !== options.requestId) {
      return;
    }
    workbench.ui.libraryAssets = [];
    workbench.ui.libraryError = friendlyError(error);
  } finally {
    if (!options.requestId || workbench.librarySearchRequestId === options.requestId) {
      workbench.ui.libraryLoading = false;
    }
  }
}

function shouldFetchAssetLibrary(workbench) {
  const scope = workbench.ui.libraryTeamAssetScope ?? "official";
  return scope !== "personal" && isApiBackedLibraryCategory(workbench.ui.libraryCategory);
}

function isApiBackedLibraryCategory(category) {
  return ["character", "scene", "prop", "image", "video"].includes(category);
}

function libraryAssetScopeLabel(scope) {
  if (scope === "official") {
    return "官方";
  }
  if (scope === "team") {
    return "团队";
  }
  return "个人";
}

function syncSelectedProjectCard(workbench, projects) {
  const selectedProjectId = workbench.ui.selectedProjectCardId;
  if (selectedProjectId && projects.some((project) => project.id === selectedProjectId)) {
    return;
  }

  const activeProjectId = workbench.state?.project?.id ?? null;
  if (activeProjectId && projects.some((project) => project.id === activeProjectId)) {
    workbench.ui.selectedProjectCardId = activeProjectId;
    return;
  }

  workbench.ui.selectedProjectCardId = projects[0]?.id ?? null;
}

function mapProjectRecordToCard(project) {
  const createdAtValue = project.createdAt ? new Date(project.createdAt) : new Date();
  const createdAtTimestamp = Number.isFinite(createdAtValue.getTime())
    ? createdAtValue.getTime()
    : Date.now();

  return {
    id: project.id,
    name: project.name ?? "未命名项目",
    aspectRatio: project.aspectRatio ?? "9:16",
    projectType: inferProjectType(project),
    status: phaseToProjectStatus(project.phase),
    coverImageUrl: project.coverImageUrl ?? "",
    createdAtTimestamp,
    createdAt: formatProjectDate(createdAtValue),
  };
}

function phaseToProjectStatus(phase) {
  if (phase === "export") {
    return "已交付";
  }
  if (phase === "shot_generation" || phase === "asset_review") {
    return "进行中";
  }
  return "草稿";
}

function projectStatusToPhase(status) {
  if (status === "Delivered" || status === "Completed") {
    return "export";
  }
  if (status === "In Progress") {
    return "shot_generation";
  }
  return "script_input";
}

function inferProjectType(project) {
  const name = String(project.name ?? "").toLocaleLowerCase();
  if (name.includes("live") || name.includes("真人")) {
    return "domestic-live";
  }
  return "anime";
}

function formatProjectDate(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}/${month}/${day}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("cover_read_failed"));
    reader.readAsDataURL(file);
  });
}

function setImageReferenceFromStoryboard(workbench, storyboardId, cropMode = "cover") {
  const storyboard = getActiveStoryboards(workbench).find((item) => item.id === storyboardId);
  const image = findStoryboardImage(
    storyboard,
    storyboard?.currentImageAssetVersionId ?? storyboard?.uploadedImages?.[0]?.id ?? "",
  );
  if (!image?.src || !image?.id) {
    return false;
  }
  updateStoryboardGenerationState(workbench, storyboardId, (state) => ({
    ...state,
    imageReference: {
      name: storyboard.uploadedImageName || "storyboard-image",
      kind: "image",
      status: "ready",
      summary: "????????????????",
      url: storyboard.previewImageUrl,
      cropMode,
    },
  }));
  return true;
}

function setEditSourceVideoFromStoryboard(workbench, storyboardId, videoId = "") {
  const storyboard = getActiveStoryboards(workbench).find((item) => item.id === storyboardId);
  const candidate =
    (storyboard?.uploadedVideos ?? []).find((item) => item.id === videoId && item.src) ??
    (storyboard?.uploadedVideos ?? []).find((item) => item.id === storyboard?.selectedUploadedVideoId && item.src) ??
    (storyboard?.uploadedVideos ?? []).find((item) => item.status === "ready" && item.src) ??
    null;
  if (!candidate?.src) {
    return null;
  }
  updateStoryboardGenerationState(workbench, storyboardId, (state) => ({
    ...state,
    editSourceVideo: {
      name: candidate.fileName || "storyboard-video",
      kind: "video",
      status: "ready",
      summary: "??????????",
      url: candidate.src,
    },
  }));
  return candidate;
}

function openAssetInspector(workbench, payload) {
  workbench.ui.assetInspector = payload;
}

function applyStoryboardImageToolAction(workbench, action, storyboardId) {
  const storyboard = getActiveStoryboards(workbench).find((item) => item.id === storyboardId);
  if (!storyboard?.previewImageUrl) {
    workbench.ui.toast = "当前分镜还没有可用图片。";
    return;
  }

  if (action === "storyboard-image-to-video") {
    workbench.ui.episodeMediaMode = "video";
    workbench.ui.videoGenerationMode = "first-frame";
    workbench.ui.selectedModelId = "vidu-q3-pro";
    syncGenerationStateFromStoryboardImage(workbench, storyboardId);
    workbench.ui.prompt = workbench.ui.prompt || buildSuggestedPrompt(storyboard, { episodeMediaMode: "video" });
    workbench.ui.toast = "已切换到图片生成视频模式。";
    return;
  }

  if (action === "storyboard-image-edit") {
    workbench.ui.episodeMediaMode = "image";
    workbench.ui.imageGenerationMode = "single-image";
    workbench.ui.selectedModelId = "jimeng-4-5";
    setImageReferenceFromStoryboard(workbench, storyboardId);
    workbench.ui.prompt = workbench.ui.prompt || buildSuggestedPrompt(storyboard, { episodeMediaMode: "image" });
    workbench.ui.toast = "已带入当前分镜图片，进入文字改图模式。";
    return;
  }

  if (action === "storyboard-image-multi-view") {
    workbench.ui.episodeMediaMode = "image";
    workbench.ui.imageGenerationMode = "multi-image";
    workbench.ui.selectedModelId = "tnb-pro";
    workbench.ui.imageCount = clampCount(workbench.ui.imageCount ?? 4, 1, 4);
    syncGenerationStateFromStoryboardImage(workbench, storyboardId);
    workbench.ui.toast = "已带入当前分镜图片，进入多视图生成模式。";
    return;
  }

  if (action === "storyboard-image-crop") {
    setImageReferenceFromStoryboard(workbench, storyboardId, "contain");
    updateStoryboardGenerationState(workbench, storyboardId, (state) => ({
      ...state,
      imageReference: state.imageReference
        ? {
            ...state.imageReference,
            cropMode: state.imageReference.cropMode === "contain" ? "cover" : "contain",
          }
        : state.imageReference,
    }));
    workbench.ui.toast = "已切换图片裁切方式。";
    return;
  }

  openAssetInspector(workbench, {
    type: "image",
    storyboardId,
    title: storyboard.title || "分镜图片",
    name: storyboard.uploadedImageName || "分镜图片",
    url: storyboard.previewImageUrl,
    status: storyboard.imageStatus || "ready",
  });
}

function applyStoryboardVideoToolAction(workbench, action, storyboardId, videoId) {
  const storyboard = getActiveStoryboards(workbench).find((item) => item.id === storyboardId);
  const video = setEditSourceVideoFromStoryboard(workbench, storyboardId, videoId);
  if (!video?.src) {
    workbench.ui.toast = "当前分镜还没有可用视频。";
    return;
  }

  if (action === "storyboard-video-more" || action === "storyboard-video-info") {
    openAssetInspector(workbench, {
      type: "video",
      storyboardId,
      videoId: video.id,
      title: storyboard?.title || "分镜视频",
      name: video.fileName || "分镜视频",
      url: video.src,
      status: video.status || "ready",
      durationLabel: video.durationLabel || "00:10",
    });
    return;
  }

  workbench.ui.episodeMediaMode = "video";
  workbench.ui.videoGenerationMode = "edit-video";
  workbench.ui.selectedModelId = "happy-horse";
  if (action === "storyboard-video-upscale") {
    workbench.ui.videoResolution = "2K";
    workbench.ui.toast = "已切换到高清视频处理配置。";
    return;
  }
  if (action === "storyboard-video-subtitle-clean") {
    workbench.ui.prompt = `${workbench.ui.prompt || ""} remove subtitles, keep framing and motion stable`.trim();
    workbench.ui.toast = "已填入去字幕处理提示词。";
    return;
  }
  workbench.ui.toast = "已切换到视频编辑模式。";
}

async function deleteStoryboardImage(workbench, storyboardId, imageId = "") {
  const storyboard = getActiveStoryboards(workbench).find((item) => item.id === storyboardId);
  const image = findStoryboardImage(storyboard, imageId);
  if (!storyboardId || !image) {
    workbench.ui.toast = "当前分镜没有可删除的图片。";
    render(workbench);
    return;
  }

  const resolvedAssetVersionId = resolveStoryboardImageAssetVersionId(workbench, storyboard, image, imageId);
  const removedUrl = image.src;
  const applyLocalRemoval = () => {
    updateStoryboardById(workbench, storyboardId, (currentStoryboard) => {
      const remainingImages = (currentStoryboard.uploadedImages ?? []).filter((item) => {
        if (item.id === image.id) {
          return false;
        }
        if (resolvedAssetVersionId && item.id === resolvedAssetVersionId) {
          return false;
        }
        if (resolvedAssetVersionId && item.deleteAssetId === resolvedAssetVersionId) {
          return false;
        }
        return true;
      });
      const nextSelectedImage =
        remainingImages.find((item) => item.id === currentStoryboard.currentImageAssetVersionId) ??
        remainingImages[0] ??
        null;
      const removedSelected =
        currentStoryboard.currentImageAssetVersionId === image.id ||
        (resolvedAssetVersionId &&
          currentStoryboard.currentImageAssetVersionId === resolvedAssetVersionId);
      return {
        ...currentStoryboard,
        uploadedImages: remainingImages,
        imageStatus: remainingImages.length ? "ready" : "empty",
        previewImageUrl:
          removedSelected ? (nextSelectedImage?.src ?? null) : currentStoryboard.previewImageUrl ?? null,
        previewUrl:
          removedSelected
            ? (nextSelectedImage?.src ?? null)
            : currentStoryboard.previewUrl ?? currentStoryboard.previewImageUrl ?? null,
        uploadedImageName:
          removedSelected ? (nextSelectedImage?.fileName ?? "") : currentStoryboard.uploadedImageName,
        currentImageAssetVersionId:
          removedSelected ? (nextSelectedImage?.id ?? null) : currentStoryboard.currentImageAssetVersionId,
      };
    });
    updateStoryboardGenerationState(workbench, storyboardId, (state) => ({
      ...state,
      firstFrame: state.firstFrame?.url === removedUrl ? null : state.firstFrame,
      lastFrame: state.lastFrame?.url === removedUrl ? null : state.lastFrame,
      imageReference: state.imageReference?.url === removedUrl ? null : state.imageReference,
    }));
    clearStoryboardImageFromState(
      workbench,
      storyboard?.linkedShotId ?? null,
      resolvedAssetVersionId ?? image.id,
      (storyboard?.uploadedImages ?? []).find((item) =>
        item.id !== image.id &&
        (!resolvedAssetVersionId || (item.id !== resolvedAssetVersionId && item.deleteAssetId !== resolvedAssetVersionId))
      ) ?? null,
    );
  };

  if (storyboard.linkedShotId) {
    workbench.ui.busy = true;
    workbench.ui.toast = "姝ｅ湪鍒犻櫎鍒嗛暅鍥剧墖...";
    render(workbench);
    try {
      const result = await deleteEpisodeFileResourceIfAvailable(workbench, {
        ...image,
        assetVersionId: resolvedAssetVersionId ?? image.assetVersionId ?? image.id,
      }) ?? await workbench.api.deleteShotMedia(storyboard.linkedShotId, {
        kind: "image",
        assetVersionId: resolvedAssetVersionId,
      });
      applyLocalRemoval();
      if (result?.missing) {
        workbench.ui.toast = "图片已从当前视图移除，后端媒体记录未找到。";
        return;
      }
      workbench.ui.toast = "已删除当前分镜图片。";
    } catch (error) {
      workbench.ui.toast = `删除失败：${friendlyError(error)}`;
    } finally {
      workbench.ui.busy = false;
      render(workbench);
    }
    return;
  }

  applyLocalRemoval();
  workbench.ui.toast = "已移除当前分镜图片。";
  render(workbench);
}

async function deleteStoryboardVideo(workbench, storyboardId, videoId) {
  if (!storyboardId || !videoId) {
    return;
  }

  const storyboard = getActiveStoryboards(workbench).find((item) => item.id === storyboardId);
  if (storyboard?.currentVideoAssetVersionId === videoId) {
    workbench.ui.toast = "当前定格视频不能删除，请先取消定格。";
    render(workbench);
    return;
  }
  const video = (storyboard?.uploadedVideos ?? []).find((item) => item.id === videoId);
  if (!video) {
    workbench.ui.toast = "当前分镜没有可删除的视频。";
    render(workbench);
    return;
  }

  const applyLocalRemoval = () => {
    cancelStoryboardVideoUpload(workbench, storyboardId, videoId);
    updateStoryboardById(workbench, storyboardId, (currentStoryboard) => {
      const remainingVideos = (currentStoryboard.uploadedVideos ?? []).filter((item) => item.id !== videoId);
      const nextSelectedVideo =
        remainingVideos.find((item) => item.id === currentStoryboard.selectedUploadedVideoId && item.status === "ready") ??
        remainingVideos.find((item) => item.status === "ready") ??
        null;
      const nextStoryboard = {
        ...currentStoryboard,
        uploadedVideos: remainingVideos,
        selectedUploadedVideoId: nextSelectedVideo?.id ?? null,
        videoStatus: nextSelectedVideo ? "ready" : "empty",
        previewVideo: nextSelectedVideo?.src ?? null,
        previewThumbnailUrl: nextSelectedVideo?.thumbnailSrc ?? null,
        currentVideoAssetVersionId:
          currentStoryboard.currentVideoAssetVersionId === videoId
            ? nextSelectedVideo?.id ?? null
            : currentStoryboard.currentVideoAssetVersionId,
      };
      return {
        ...nextStoryboard,
        previewUrl: resolveStoryboardCombinedPreviewUrl(nextStoryboard),
      };
    });
    clearStoryboardVideoFromState(workbench, storyboard?.linkedShotId ?? null, videoId);
  };

  if (storyboard.linkedShotId) {
    await runAction(workbench, "正在删除分镜视频...", async () => {
      try {
        await deleteEpisodeFileResourceIfAvailable(workbench, {
          ...video,
          assetVersionId: video.assetVersionId ?? videoId,
        }) ?? await workbench.api.deleteShotMedia(storyboard.linkedShotId, {
          kind: "video",
          assetVersionId: videoId,
        });
      } catch (error) {
        const errorMessage = String(error instanceof Error ? error.message : error);
        if (!errorMessage.includes("shot_media_not_found")) {
          throw error;
        }
      }
      applyLocalRemoval();
    });
    return;
  }

  applyLocalRemoval();
  persistWorkbenchState(workbench);
  workbench.ui.toast = `已移除 ${video.fileName || "分镜视频"}。`;
  render(workbench);
}
