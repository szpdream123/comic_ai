import { renderProjectDetail } from "./project-detail.js";
import { buildProjectCreateRequest } from "./project-create-request.js";
import { validateTeamAssetLocalUploadFile } from "../library-team/asset-library-page.js";
import {
  addStoryboard,
  createEmptyGenerationState,
  createStoryboardList,
  getSelectedStoryboard,
  insertStoryboardAfter,
  normalizeStoryboardIndices,
  sortStoryboardsByIndex,
} from "./storyboard-state.js";
import {
  EPISODE_WORKBENCH_FALLBACK_ASSET_IDS,
  renderPromptDock,
  renderStoryboardStageForPartialUpdate,
} from "./episode-workbench-rebuilt.js";
import { resolveEpisodeWorkbenchPrompt, resolveStoryboardPromptForMode } from "./episode-workbench-prompt.js";
import { validateVideoGeneration } from "./video-generation-panel.js";
import { getLibraryAssetById, getLibraryAssetsForImport, getLibraryTypeByCategory } from "../library-team/asset-library-page.js";
import { defaultUploadLimits, resolveApiUrl } from "../../shared/creator-api.js";

const TEAM_ASSET_LOCAL_UPLOAD_CATEGORY_PREFIX = "team-assets";

const DEFAULT_SCRIPT = `Episode 1: Dawn over the mechanical city.

The lead mechanist opens the tower window, sees the industrial skyline, and prepares to launch the first test frame.`;
const SINGLE_EPISODE_AI_LIVE_TEXT_LIMIT = 16000;
const EPISODE_ASSET_DESCRIPTION_LIMIT = 2500;
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
    let uploadedVideos = mergeStoryboardUploadedVideos(
      storyboard.uploadedVideos ?? [],
      synced.uploadedVideos ?? [],
      { preserveUploadingOnly: Boolean(storyboard.linkedShotId) },
    );
    const uploadedImages = mergeStoryboardUploadedImages(
      storyboard.uploadedImages ?? [],
      synced.uploadedImages ?? [],
      { preserveUploadingOnly: Boolean(storyboard.linkedShotId) },
    );
    const pendingVideo = resolvePendingStoryboardVideo(storyboard);
    const shouldKeepPendingVideo = Boolean(
      pendingVideo && !doesSyncedStoryboardMatchPendingVideo(synced, pendingVideo),
    );
    if (shouldKeepPendingVideo) {
      uploadedVideos = mergeStoryboardUploadedVideos(uploadedVideos, [pendingVideo]);
    }
    const selectedUploadedVideoId = shouldKeepPendingVideo
      ? pendingVideo.id
      : synced.selectedUploadedVideoId !== undefined
        ? synced.selectedUploadedVideoId
        : (storyboard.selectedUploadedVideoId ?? null);
    const mergedStoryboard = {
      ...storyboard,
      ...synced,
      uploadedImages,
      uploadedVideos,
      generationState: mergeGenerationState(storyboard.generationState, synced.generationState),
      selectedUploadedVideoId,
      currentVideoAssetVersionId: shouldKeepPendingVideo
        ? pendingVideo.id
        : (synced.currentVideoAssetVersionId ?? storyboard.currentVideoAssetVersionId ?? null),
      pendingCurrentVideoAssetVersionId: shouldKeepPendingVideo ? pendingVideo.id : null,
      pendingCurrentVideoSourceUrl: shouldKeepPendingVideo ? pendingVideo.src ?? null : null,
      pendingCurrentVideoThumbnailUrl: shouldKeepPendingVideo ? pendingVideo.thumbnailSrc ?? null : null,
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

function resolvePendingStoryboardVideo(storyboard) {
  const pendingVideoId = storyboard?.pendingCurrentVideoAssetVersionId ?? null;
  const pendingVideoSrc = storyboard?.pendingCurrentVideoSourceUrl ?? null;
  if (!pendingVideoId && !pendingVideoSrc) {
    return null;
  }

  const uploadedVideos = Array.isArray(storyboard?.uploadedVideos) ? storyboard.uploadedVideos : [];
  const matchedVideo =
    uploadedVideos.find((video) => pendingVideoId && video.id === pendingVideoId && video.status === "ready") ??
    uploadedVideos.find((video) => pendingVideoSrc && video.src === pendingVideoSrc && video.status === "ready") ??
    null;
  const src = matchedVideo?.src ?? pendingVideoSrc ?? null;
  if (!src) {
    return null;
  }

  return {
    ...(matchedVideo ?? {}),
    id: matchedVideo?.id ?? pendingVideoId,
    src,
    thumbnailSrc:
      matchedVideo?.thumbnailSrc ??
      storyboard?.pendingCurrentVideoThumbnailUrl ??
      storyboard?.previewThumbnailUrl ??
      null,
    status: "ready",
  };
}

function doesSyncedStoryboardMatchPendingVideo(storyboard, pendingVideo) {
  if (!storyboard || !pendingVideo) {
    return false;
  }

  const pendingVideoId = String(pendingVideo.id ?? "").trim();
  const pendingVideoSrc = String(pendingVideo.src ?? "").trim();
  const syncedVideoId = String(storyboard.currentVideoAssetVersionId ?? "").trim();
  if (pendingVideoId && syncedVideoId && pendingVideoId === syncedVideoId) {
    return true;
  }

  const syncedVideoSources = [
    storyboard.previewVideo,
    ...(Array.isArray(storyboard.uploadedVideos) ? storyboard.uploadedVideos.map((video) => video?.src) : []),
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  return Boolean(pendingVideoSrc && syncedVideoSources.includes(pendingVideoSrc));
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
const TEAM_ASSET_LOCAL_UPLOAD_LIMIT = 20;

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
    homeLiquidEther: null,
    homeLiquidEtherToken: null,
    state: null,
    ui: {
      busy: false,
      toast: "",
      validationMessage: "",
      isCreateModalOpen: false,
      createProjectName: "",
      createAspectRatio: "9:16",
      createProjectType: "animation",
      createProjectNotice: "",
      projectStyles: [],
      isProjectStyleMenuOpen: false,
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
      selectedStoryboardIds: [],
      episodeAssetCreateModal: null,
      episodeWorkbenchAttachments: [],
      episodeWorkbenchSelectedAttachmentIds: [],
      episodeWorkbenchScrollTarget: null,
      episodeWorkbenchConversationScrollMode: null,
      episodeVoiceModal: null,
      episodeBatchModal: null,
      exportOptionModal: null,
      projectOtherAssetMediaType: "video",
      projectMembers: [],
      projectStats: null,
      teamMemberSearchQuery: "",
      teamMemberRoleFilter: "all",
      teamMemberStatusFilter: "all",
      teamDashboardTab: "member-consumption",
      teamDashboardDateShortcut: "今天",
      teamDashboardRoleFilter: "all",
      teamDashboardStatusFilter: "all",
      selectedDashboardMemberId: null,
      billingPackages: [],
      createMemberModal: null,
      editMemberModal: null,
      projectLibraryAssetsByType: null,
      libraryAssetSearchQuery: "",
      libraryAssetTypeFilter: "all",
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
      assetImportPage: 1,
      assetImportPageSize: 10,
      assetImportPageSizeMenuOpen: false,
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
      assetGeneratorName: "废土角色(1)",
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
      singleEpisodeLookPanel: "",
      storyboardPromptPackages: [],
      singleEpisodeAiPreview: {
        status: "idle",
        data: null,
        error: "",
      },
      selectedSingleEpisodeLookPackageIds: {
        genre: [],
        emotion: [],
      },
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
      scriptSearchQuery: "",
      scriptTypeFilter: "all",
      scriptSortOrder: "updated-desc",
      scriptSubmitAction: "create-project",
      scriptSubmitLabel: "创建项目",
      uploadNotice: "",
      selectedModelId: "gpt-image-2-cn",
      prompt: "",
      promptMentionMenuOpen: false,
      promptMentionQuery: "",
      promptMentionSuggestions: [],
      promptMentionPreviewOpen: false,
      promptMentionPreviewAsset: null,
      lipSyncVoiceId: null,
      lipSyncVoiceName: "",
      lipSyncVoiceSource: null,
      lipSyncAudioItems: [],
      lipSyncPreviewAudioId: null,
      assetConversationHistory: {},
      storyboardConversationHistory: {},
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
      generationQueueHealth: null,
      generationQueueJobOperationConfirm: null,
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
      selectedLibraryAssetId: null,
      selectedLibraryImportIds: [],
      isLibraryPricingModalOpen: false,
      isMemberRulesModalOpen: false,
      isTeamMemberCreateOpen: false,
      teamOverview: null,
      teamMembers: [],
      teamError: "",
      teamMemberDraft: createTeamMemberDraft(),
      teamMemberCreateNotice: "",
      teamTemporaryPassword: "",
    },
  };
  installEpisodeWorkbenchTestHooks(workbench);
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
      if (workbench.ui.promptMentionMenuOpen || workbench.ui.promptMentionPreviewOpen) {
        clearPromptMentionUi(workbench);
        render(workbench);
        return;
      }
      const cardTarget = eventTarget?.closest?.(".episode-replica-asset-card[data-asset-card-id]");
      const storyboardCardTarget = eventTarget?.closest?.(".episode-replica-shot-card[data-storyboard-id]");
      const blockedInteractiveTarget = eventTarget?.closest?.(
        "textarea, input, button, select, option, label, a, [contenteditable='true']",
      );
      if (storyboardCardTarget && !blockedInteractiveTarget) {
        requestEpisodeWorkbenchConversationScroll(workbench);
        void handleAction(workbench, {
          dataset: {
            action: "select-storyboard",
            storyboardId: storyboardCardTarget.dataset.storyboardId ?? "",
          },
        }).catch((error) => {
          workbench.ui.toast = `操作失败：${friendlyError(error)}`;
          render(workbench);
        });
        return;
      }
      if (cardTarget && !blockedInteractiveTarget) {
        requestEpisodeWorkbenchConversationScroll(workbench);
        void handleAction(workbench, {
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
        workbench.ui.singleEpisodeLookPanel ||
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
        workbench.ui.singleEpisodeLookPanel = "";
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
    requestEpisodeWorkbenchConversationScroll(workbench);
    void handleAction(workbench, actionTarget).catch((error) => {
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
      !workbench.ui.isTeamMemberCreateOpen &&
      !workbench.ui.isVideoModelMenuOpen &&
      !workbench.ui.openGenerationSelectMenu &&
      !workbench.ui.musePromptMenu &&
      !workbench.ui.singleEpisodeLookPanel &&
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
    workbench.ui.isTeamMemberCreateOpen = false;
    workbench.ui.teamMemberCreateNotice = "";
    workbench.ui.teamTemporaryPassword = "";
    workbench.ui.libraryDetailAssetId = "";
    workbench.ui.libraryDetailView = "turnaround";
    workbench.ui.isVideoModelMenuOpen = false;
    workbench.ui.openGenerationSelectMenu = null;
    workbench.ui.musePromptMenu = null;
    workbench.ui.singleEpisodeLookPanel = "";
    workbench.ui.isFirstFrameMenuOpen = false;
    workbench.ui.activeGenerationFrameMenu = null;
    workbench.ui.referenceAssetPickerKind = null;
    workbench.ui.storyboardDeleteId = null;
    render(workbench, { preserveLibraryScroll: true });
  });

  root.addEventListener("change", async (event) => {
    const target = resolveEventElement(event.target);

    if (
      target?.matches?.("#team-member-role-input") ||
      target?.matches?.("#team-edit-member-role-input")
    ) {
      void handleAction(workbench, target).catch((error) => {
        workbench.ui.toast = `操作失败：${friendlyError(error)}`;
        render(workbench);
      });
      return;
    }

    if (target?.matches?.("[data-model-choice]")) {
      workbench.ui.selectedModelId = target.value;
      applySelectedModelGenerationDefaults(workbench, workbench.ui.episodeMediaMode === "video" ? "video" : "image");
      workbench.ui.toast = `Selected ${target.options[target.selectedIndex]?.text ?? target.value}.`;
      render(workbench);
      return;
    }

    if (target?.matches?.('input[name="video-model"]')) {
      workbench.ui.selectedModelId = target.value;
      applySelectedModelGenerationDefaults(workbench, workbench.ui.episodeMediaMode === "video" ? "video" : "image");
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
      workbench.ui.isProjectStyleMenuOpen = false;
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

    if (target?.matches?.("#team-member-business-role")) {
      workbench.ui.teamMemberDraft = {
        ...workbench.ui.teamMemberDraft,
        businessRole: target.value,
      };
      workbench.ui.teamMemberCreateNotice = "";
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
      await runAction(workbench, "正在上传项目封面...", async () => {
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

    if (
      target?.matches?.("#team-member-phone-input") ||
      target?.matches?.("#team-member-note-input") ||
      target?.matches?.("#team-edit-member-note-input")
    ) {
      void handleAction(workbench, target).catch((error) => {
        workbench.ui.toast = `操作失败：${friendlyError(error)}`;
        render(workbench);
      });
      return;
    }

    if (target?.matches?.("#video-prompt-input")) {
      const selectionStart = Number(target.selectionStart ?? target.value.length);
      const scrollTop = Number(target.scrollTop ?? 0);
      const beforeMentionUi = snapshotPromptMentionUi(workbench);
      setCurrentScopePrompt(workbench, target.value);
      updatePromptMentionState(workbench, target.value, selectionStart);
      collectEpisodeWorkbenchEvent(workbench, "prompt.input", {
        value: target.value,
        length: [...target.value].length,
        mediaMode: workbench.ui.episodeMediaMode ?? "image",
        selectedStoryboardId: workbench.ui.selectedStoryboardId ?? null,
      });
      if (hasPromptMentionUiChanged(beforeMentionUi, workbench)) {
        render(workbench);
        queueMicrotask(() => {
          const textarea = workbench.root.querySelector("#video-prompt-input");
          if (textarea) {
            textarea.focus();
            textarea.setSelectionRange(selectionStart, selectionStart);
            textarea.scrollTop = scrollTop;
            positionPromptMentionPreview(workbench, textarea);
          }
        });
      }
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

    if (target?.matches?.("#team-member-team-account")) {
      workbench.ui.teamMemberDraft = {
        ...workbench.ui.teamMemberDraft,
        teamAccount: target.value,
      };
      workbench.ui.teamMemberCreateNotice = "";
      return;
    }

    if (target?.matches?.("#team-member-display-name")) {
      workbench.ui.teamMemberDraft = {
        ...workbench.ui.teamMemberDraft,
        displayName: target.value,
      };
      workbench.ui.teamMemberCreateNotice = "";
      return;
    }

    if (target?.matches?.("#team-member-initial-credits")) {
      workbench.ui.teamMemberDraft = {
        ...workbench.ui.teamMemberDraft,
        initialCredits: target.value,
      };
      workbench.ui.teamMemberCreateNotice = "";
      return;
    }

    if (target?.matches?.("#team-member-remark")) {
      workbench.ui.teamMemberDraft = {
        ...workbench.ui.teamMemberDraft,
        remark: target.value,
      };
      workbench.ui.teamMemberCreateNotice = "";
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
      const notice = workbench.root.querySelector(".single-episode-inline-notice");
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

    if (target?.matches?.('[data-action="search-scripts"]')) {
      workbench.ui.scriptSearchQuery = target.value;
      render(workbench);
      return;
    }

    if (target?.matches?.('[data-action="set-script-type-filter"]')) {
      workbench.ui.scriptTypeFilter = target.value || "all";
      render(workbench);
      return;
    }

    if (target?.matches?.('[data-action="set-script-sort-order"]')) {
      workbench.ui.scriptSortOrder = target.value || "updated-desc";
      render(workbench);
      return;
    }

    if (target?.matches?.('[data-action="search-team-members"]')) {
      workbench.ui.teamMemberSearchQuery = target.value;
      render(workbench);
      return;
    }

    if (target?.matches?.('[data-action="set-team-member-role-filter"]')) {
      workbench.ui.teamMemberRoleFilter = target.value || "all";
      render(workbench);
      return;
    }

    if (target?.matches?.('[data-action="set-team-member-status-filter"]')) {
      workbench.ui.teamMemberStatusFilter = target.value || "all";
      render(workbench);
      return;
    }

    if (target?.matches?.('[data-action="set-library-asset-type-filter"]')) {
      workbench.ui.libraryAssetTypeFilter = target.value || "all";
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
        counter.textContent = `${[...target.value].length} / ${EPISODE_ASSET_DESCRIPTION_LIMIT}`;
      }
      collectEpisodeWorkbenchEvent(workbench, "asset-description.input", {
        assetId: target.dataset.assetId ?? "",
        assetKind: target.dataset.assetKind ?? "character",
        value: target.value,
        length: [...target.value].length,
      });
      return;
    }

    if (target?.matches?.(".episode-replica-shot-desc-input")) {
      const storyboardId = target.dataset.storyboardId ?? "";
      if (storyboardId) {
        workbench.ui.selectedStoryboardId = storyboardId;
      }
      const counter = target.closest(".episode-replica-shot-card")?.querySelector(".count");
      if (counter) {
        counter.textContent = `${[...target.value].length} / 3000`;
      }
      if (storyboardId) {
        updateActiveStoryboards(workbench, (storyboard) =>
          String(storyboard?.id ?? "") === String(storyboardId)
            ? {
                ...storyboard,
                description: target.value,
              }
            : storyboard,
        );
      }
      return;
    }

    if (target?.matches?.('[data-action="search-projects"]')) {
      workbench.ui.projectSearchQuery = target.value;
      workbench.ui.projectLibraryPage = 1;
      render(workbench);
    }
  });

  root.addEventListener("mousedown", (event) => {
    const target = resolveEventElement(event.target);
    if (!target?.matches?.("#video-prompt-input")) {
      dismissPromptMentionPreview(workbench);
    }
  });

  root.addEventListener("mouseup", (event) => {
    const target = resolveEventElement(event.target);
    if (!target?.matches?.("#video-prompt-input")) {
      dismissPromptMentionPreview(workbench);
      return;
    }
    queueMicrotask(() => {
      syncPromptMentionAfterSelection(workbench, target);
    });
  });

  root.addEventListener("focusout", async (event) => {
    const target = resolveEventElement(event.target);
    if (!target?.matches?.(".episode-replica-shot-desc-input")) {
      return;
    }

    const storyboardId = target.dataset.storyboardId ?? "";
    if (!storyboardId) {
      return;
    }

    const storyboard = getActiveStoryboards(workbench).find(
      (item) => String(item?.id ?? "") === String(storyboardId),
    );
    if (!storyboard?.linkedShotId || typeof workbench.api?.updateShot !== "function") {
      return;
    }

    const nextDescription = String(target.value ?? "");
    const persistedDescription = String(
      storyboard.sceneAnalysis ?? storyboard.description ?? storyboard.plotPreview ?? "",
    );
    if (nextDescription === persistedDescription) {
      return;
    }

    updateStoryboardById(workbench, storyboardId, (currentStoryboard) => ({
      ...currentStoryboard,
      description: nextDescription,
      sceneAnalysis: nextDescription,
    }));

    try {
      await workbench.api.updateShot({
        shotId: storyboard.linkedShotId,
        description: nextDescription,
      });
      updateStoryboardById(workbench, storyboardId, (currentStoryboard) => ({
        ...currentStoryboard,
        description: nextDescription,
        sceneAnalysis: nextDescription,
      }));
      workbench.ui.toast = "修改成功";
      render(workbench);
    } catch (error) {
      workbench.ui.toast = `分镜内容保存失败：${friendlyError(error)}`;
      render(workbench);
    }
  });

  root.addEventListener("keyup", (event) => {
    const target = resolveEventElement(event.target);
    if (!target?.matches?.("#video-prompt-input")) {
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
      return;
    }
    syncPromptMentionAfterSelection(workbench, target);
  });

  root.addEventListener("focusout", async (event) => {
    const target = resolveEventElement(event.target);
    if (target?.matches?.(".episode-replica-asset-desc-input")) {
      const assetId = target.dataset.assetId ?? "";
      const assetKind = target.dataset.assetKind ?? "character";
      await saveEpisodeAssetDescription(workbench, assetKind, assetId, target.value);
      return;
    }
    if (target?.matches?.(".episode-replica-shot-desc-input")) {
      const storyboardId = target.dataset.storyboardId ?? "";
      await saveStoryboardDescriptionInline(workbench, storyboardId, target.value);
      return;
    }
    if (target?.matches?.("#video-prompt-input") && workbench.ui.episodeMediaMode === "lip-sync") {
      await persistLipSyncStoryboardDraft(workbench, { silent: true });
    }
    if (target?.matches?.("#video-prompt-input")) {
      clearPromptMentionUi(workbench);
      render(workbench);
    }
  });

  await refresh(workbench);
  render(workbench);
}

function installEpisodeWorkbenchTestHooks(workbench) {
  if (typeof window === "undefined") {
    return;
  }
  window.__episodeWorkbenchTestApi = {
    getPromptMentionState() {
      const selectedStoryboard = getSelectedStoryboard(
        getActiveStoryboards(workbench),
        workbench.ui.selectedStoryboardId,
      );
      return {
        open: Boolean(workbench.ui.promptMentionMenuOpen),
        query: workbench.ui.promptMentionQuery ?? "",
        suggestionCount: workbench.ui.promptMentionSuggestions?.length ?? 0,
        mentionReferenceCount: selectedStoryboard?.generationState?.mentionReferences?.length ?? 0,
        suggestions: (workbench.ui.promptMentionSuggestions ?? []).map((item) => ({
          assetId: item.id ?? item.assetId ?? "",
          assetKind: item.assetKind ?? item.kind ?? "character",
          name: item.name ?? "",
        })),
        prompt: String(workbench.ui.prompt ?? ""),
      };
    },
    selectFirstPromptMention() {
      const suggestion = workbench.ui.promptMentionSuggestions?.[0] ?? null;
      if (!suggestion) {
        return false;
      }
      insertEpisodeAssetMention(workbench, suggestion, suggestion.assetKind ?? suggestion.kind ?? "character");
      workbench.ui.promptMentionMenuOpen = false;
      workbench.ui.promptMentionQuery = "";
      workbench.ui.promptMentionSuggestions = [];
      render(workbench);
      return true;
    },
  };
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
  await syncProjectStyles(workbench);
  await syncStoryboardPromptPackages(workbench);
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
  const restoredEpisodeRoute = await restoreEpisodeRouteState(workbench, window.location);
  if (!restoredEpisodeRoute) {
    const restoredProjectRoute = await restoreProjectRouteState(workbench, window.location);
    if (
      !restoredProjectRoute &&
      workbench.ui.projectPanelMode === "episode-workbench" &&
      workbench.ui.selectedEpisodeId
    ) {
      await enterEpisodeWorkbench(workbench, workbench.ui.selectedEpisodeId, {
        preserveRoute: true,
        shouldRender: false,
      });
    }
  }
  syncSelectedStoryboardId(workbench, getActiveStoryboards(workbench, nextStoryboards));
  if (workbench.ui.activeNavTab === "team") {
    await loadTeamSurface(workbench);
  }
  if (shouldPrefetchReusableAssetLibrary(workbench)) {
    await syncAssetLibraryFromApi(workbench);
  }
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
  const projectId = resolveActiveProjectId(workbench);
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

async function syncProjectLibraryAssets(workbench) {
  const projectId = resolveActiveProjectId(workbench);
  if (!projectId) {
    workbench.ui.projectLibraryAssetsByType = null;
    return;
  }

  try {
    const payload = await workbench.api.getAssetLibrary();
    workbench.ui.projectLibraryAssetsByType = groupLibraryAssetsByType(payload?.assets ?? []);
  } catch (error) {
    if (String(error?.errorCode ?? "") === "creator_project_missing") {
      workbench.ui.projectLibraryAssetsByType = null;
      return;
    }
    throw error;
  }
}

function resolveActiveProjectId(workbench) {
  return (
    workbench.ui.selectedProjectCardId ??
    workbench.state?.project?.id ??
    workbench.ui.projectDetail?.project?.id ??
    workbench.ui.projectDetail?.id ??
    null
  );
}

async function syncBillingPackages(workbench) {
  try {
    const payload = await workbench.api.getBillingPackages();
    workbench.ui.billingPackages = Array.isArray(payload?.packages) ? payload.packages : [];
  } catch {
    workbench.ui.billingPackages = [];
  }
}

async function syncProjectStyles(workbench) {
  if (typeof workbench.api?.getProjectStyles !== "function") {
    workbench.ui.projectStyles = [];
    return;
  }

  try {
    const payload = await workbench.api.getProjectStyles();
    workbench.ui.projectStyles = resolveProjectStyleList(payload);
    workbench.ui.createProjectType = resolveProjectStyleSelection(workbench);
  } catch {
    workbench.ui.projectStyles = [];
  }
}

async function syncStoryboardPromptPackages(workbench) {
  if (typeof workbench.api?.getStoryboardPromptPackages !== "function") {
    workbench.ui.storyboardPromptPackages = [];
    return;
  }

  try {
    const payload = await workbench.api.getStoryboardPromptPackages();
    workbench.ui.storyboardPromptPackages = resolveStoryboardPromptPackageList(payload);
  } catch {
    workbench.ui.storyboardPromptPackages = [];
  }
}

function resolveStoryboardPromptPackageList(payload) {
  if (Array.isArray(payload?.packages)) {
    return payload.packages;
  }
  if (Array.isArray(payload?.data)) {
    return payload.data;
  }
  if (Array.isArray(payload?.data?.packages)) {
    return payload.data.packages;
  }
  if (Array.isArray(payload?.data?.data)) {
    return payload.data.data;
  }
  return [];
}

function resolveProjectStyleList(payload) {
  const raw = Array.isArray(payload?.styles)
    ? payload.styles
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.data?.styles)
        ? payload.data.styles
        : Array.isArray(payload?.data?.data)
          ? payload.data.data
          : [];
  return raw
    .filter((item) => item && typeof item === "object" && item.status !== "disabled")
    .map((item) => ({
      id: String(item.id ?? item.code ?? ""),
      name: String(item.name ?? ""),
      code: String(item.code ?? ""),
      coverImageUrl: String(item.coverImageUrl ?? item.cover_image_url ?? ""),
      status: String(item.status ?? "enabled"),
    }))
    .filter((item) => item.code && item.name);
}

function resolveDefaultProjectStyleCode(workbench) {
  return workbench.ui.projectStyles?.[0]?.code ?? "animation";
}

function resolveProjectStyleSelection(workbench) {
  const current = String(workbench.ui.createProjectType ?? "");
  const styles = Array.isArray(workbench.ui.projectStyles) ? workbench.ui.projectStyles : [];
  if (!styles.length) {
    return current || "animation";
  }
  return styles.some((style) => style.code === current) ? current : styles[0].code;
}

async function loadTeamSurface(workbench) {
  if (
    typeof workbench.api?.getTeamOverview !== "function" ||
    typeof workbench.api?.getTeamMembers !== "function"
  ) {
    workbench.ui.teamOverview = null;
    workbench.ui.teamMembers = [];
    workbench.ui.teamError = "团队接口暂不可用，请刷新页面后重试。";
    return;
  }

  try {
    const [overviewPayload, membersPayload] = await Promise.all([
      workbench.api.getTeamOverview(),
      workbench.api.getTeamMembers(),
    ]);
    workbench.ui.teamOverview = overviewPayload?.overview ?? overviewPayload?.team ?? overviewPayload ?? null;
    workbench.ui.teamMembers = Array.isArray(membersPayload?.members) ? membersPayload.members : [];
    workbench.ui.teamError = "";
  } catch (error) {
    workbench.ui.teamOverview = null;
    workbench.ui.teamMembers = [];
    workbench.ui.teamError = friendlyError(error);
  }
}

function render(workbench, options = {}) {
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
  restoreLibraryScrollState(workbench.root, workbench.ui.libraryScrollState);
  if (options.focusLibrarySearch) {
    restoreLibrarySearchFocus(workbench.root);
  }
  if (workbench.ui.singleEpisodeAiPreview?.status !== "loading") {
    persistWorkbenchState(workbench);
  }
  applyPostRenderEffects(workbench);
  keepSingleEpisodeAiLiveOutputPinnedToLatest(workbench);
}

function renderSingleEpisodeAiPreviewProgress(workbench) {
  const now = Date.now();
  const lastRenderAt = Number(workbench.singleEpisodeAiPreviewLastRenderAt ?? 0);
  if (now - lastRenderAt < 350) {
    workbench.singleEpisodeAiPreviewRenderPending = true;
    if (!workbench.singleEpisodeAiPreviewRenderTimer) {
      workbench.singleEpisodeAiPreviewRenderTimer = setTimeout(() => {
        workbench.singleEpisodeAiPreviewRenderTimer = null;
        if (workbench.ui.singleEpisodeAiPreview?.status !== "loading") {
          return;
        }
        workbench.singleEpisodeAiPreviewLastRenderAt = Date.now();
        workbench.singleEpisodeAiPreviewRenderPending = false;
        render(workbench);
      }, 350 - (now - lastRenderAt));
    }
    return;
  }
  workbench.singleEpisodeAiPreviewLastRenderAt = now;
  workbench.singleEpisodeAiPreviewRenderPending = false;
  render(workbench);
}

function clearSingleEpisodeAiPreviewRenderTimer(workbench) {
  if (workbench.singleEpisodeAiPreviewRenderTimer) {
    clearTimeout(workbench.singleEpisodeAiPreviewRenderTimer);
    workbench.singleEpisodeAiPreviewRenderTimer = null;
  }
  workbench.singleEpisodeAiPreviewRenderPending = false;
}

function keepSingleEpisodeAiLiveOutputPinnedToLatest(workbench) {
  if (workbench.ui.singleEpisodeAiPreview?.status !== "loading") {
    return;
  }
  const liveOutput = workbench.root.querySelector?.(".single-episode-ai-live-output pre");
  if (!liveOutput) {
    return;
  }
  liveOutput.scrollTop = liveOutput.scrollHeight;
}

function restoreLibraryScrollState(root, libraryScrollState) {
  if (!root || !libraryScrollState) {
    return;
  }
  const scrollTarget = root.querySelector?.(".library-team-shell, .workbench-scroll-surface");
  if (scrollTarget && Number.isFinite(Number(libraryScrollState.scrollTop))) {
    scrollTarget.scrollTop = Number(libraryScrollState.scrollTop);
  }
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
  const input = root?.querySelector?.("[data-library-search-input]");
  if (!input) {
    return;
  }
  input.focus({ preventScroll: true });
  const position = input.value.length;
  input.setSelectionRange?.(position, position);
}

function renderPreservingEpisodeAssetScroll(workbench) {
  const previousScrollTop = workbench.root.querySelector(".episode-replica-left")?.scrollTop ?? null;
  render(workbench);
  if (previousScrollTop == null) {
    return;
  }
  const scrollContainer = workbench.root.querySelector(".episode-replica-left");
  if (scrollContainer) {
    scrollContainer.scrollTop = previousScrollTop;
  }
}

function requestEpisodeWorkbenchConversationScroll(workbench) {
  if (workbench.ui.projectPanelMode !== "episode-workbench") {
    return;
  }
  if (workbench.ui.episodeWorkbenchConversationScrollMode === "latest") {
    return;
  }
  workbench.ui.episodeWorkbenchConversationScrollMode = "bottom";
}

function renderEpisodeWorkbenchPromptDockOnly(workbench) {
  const root = workbench?.root;
  const currentPromptDock = root?.querySelector?.(".episode-replica-prompt");
  if (!currentPromptDock || workbench.ui.projectPanelMode !== "episode-workbench") {
    render(workbench);
    return;
  }
  const scopeMode = workbench.ui.museScopeMode ?? "storyboard";
  const mediaMode = workbench.ui.episodeMediaMode ?? "image";
  const activeStoryboards = getActiveStoryboards(workbench);
  const selectedStoryboard = getSelectedStoryboard(activeStoryboards, workbench.ui.selectedStoryboardId);
  const assetGroups = resolveEpisodeWorkbenchAssetLibraryFromState(workbench);
  const activeAssetTab = workbench.ui.projectAssetTab ?? "character";
  const selectedAsset =
    (assetGroups?.[activeAssetTab] ?? []).find((item) => item.id === workbench.ui.selectedEpisodeAssetId) ??
    (assetGroups?.[activeAssetTab] ?? [])[0] ??
    null;
  const replacement = document.createElement("div");
  replacement.innerHTML = renderPromptDock({
    selectedStoryboard,
    selectedAsset,
    selectedModelId: workbench.ui.selectedModelId,
    prompt: getCurrentScopePrompt(workbench),
    busy: workbench.ui.busy,
    canGenerateCurrentMode: true,
    validationMessage: workbench.ui.validationMessage ?? "",
    generationControls: {
      videoDurationSec: workbench.ui.videoDurationSec,
      videoResolution: workbench.ui.videoResolution,
      videoCount: workbench.ui.videoCount,
      videoAudioEnabled: workbench.ui.videoAudioEnabled,
      videoMusicEnabled: workbench.ui.videoMusicEnabled,
      videoLipSyncEnabled: workbench.ui.videoLipSyncEnabled,
      imageCount: workbench.ui.imageCount,
      imageResolution: workbench.ui.imageResolution,
      imageAspectRatio: workbench.ui.imageAspectRatio,
      multiImageStrategy: workbench.ui.multiImageStrategy,
      parameterValues: workbench.ui.generationParameterValues ?? null,
      uploadLimits: workbench.ui.episodeGenerationConfig?.uploadLimits ?? null,
    },
    episodeGenerationConfig: workbench.ui.episodeGenerationConfig ?? null,
    generationUiState: {
      isVideoModelMenuOpen: Boolean(workbench.ui.isVideoModelMenuOpen),
      openGenerationSelectMenu: workbench.ui.openGenerationSelectMenu ?? null,
      isFirstFrameMenuOpen: Boolean(workbench.ui.isFirstFrameMenuOpen),
      activeGenerationFrameMenu: workbench.ui.activeGenerationFrameMenu ?? null,
      isGenerationConsoleCollapsed: Boolean(workbench.ui.isGenerationConsoleCollapsed),
      museBoardMode: workbench.ui.museBoardMode ?? "operation",
      museScopeMode: scopeMode,
      musePromptMenu: workbench.ui.musePromptMenu ?? null,
      promptMentionMenuOpen: Boolean(workbench.ui.promptMentionMenuOpen),
      promptMentionQuery: workbench.ui.promptMentionQuery ?? "",
      promptMentionSuggestions: workbench.ui.promptMentionSuggestions ?? [],
      promptMentionPreviewOpen: Boolean(workbench.ui.promptMentionPreviewOpen),
      promptMentionPreviewAsset: workbench.ui.promptMentionPreviewAsset ?? null,
      referencePromptPreset: workbench.ui.referencePromptPreset ?? "none",
      assetPromptDraft: workbench.ui.assetPromptDraft ?? null,
      lipSyncVoiceId: workbench.ui.lipSyncVoiceId ?? null,
      lipSyncVoiceName: workbench.ui.lipSyncVoiceName ?? "",
      lipSyncVoiceSource: workbench.ui.lipSyncVoiceSource ?? null,
      lipSyncAudioItems: workbench.ui.lipSyncAudioItems ?? [],
    },
    mediaMode,
    attachments: workbench.ui.episodeWorkbenchAttachments ?? [],
    selectedAttachmentIds: workbench.ui.episodeWorkbenchSelectedAttachmentIds ?? [],
    generationPollingActive: Boolean(workbench.ui.generationPollingActive),
    scopeMode,
  });
  const nextPromptDock = replacement.firstElementChild;
  if (nextPromptDock) {
    currentPromptDock.replaceWith(nextPromptDock);
    return;
  }
  render(workbench);
}

function scrollEpisodeWorkbenchConversationToBottom(workbench) {
  const conversationContainer = workbench?.root?.querySelector?.(".episode-replica-stage-body");
  if (!conversationContainer) {
    return;
  }
  conversationContainer.scrollTo({
    top: conversationContainer.scrollHeight,
    behavior: "smooth",
  });
}

function renderEpisodeWorkbenchStageBodyOnly(workbench) {
  const root = workbench?.root;
  const stageBody = root?.querySelector?.(".episode-replica-stage-body");
  if (!stageBody || workbench.ui.projectPanelMode !== "episode-workbench") {
    render(workbench);
    return;
  }
  const activeStoryboards = getActiveStoryboards(workbench);
  const selectedStoryboard = getSelectedStoryboard(activeStoryboards, workbench.ui.selectedStoryboardId);
  const mediaKind = resolveStoryboardConversationMediaKind(workbench);
  const entries = listStoryboardConversationHistoryEntries(workbench, selectedStoryboard?.id ?? workbench.ui.selectedStoryboardId, mediaKind);
  const result = mediaKind === "video" ? workbench.ui.videoGenerationResult : workbench.ui.imageGenerationResult;
  const html = renderStoryboardStageForPartialUpdate(selectedStoryboard, workbench.ui.episodeMediaMode ?? "image", result, entries);
  stageBody.innerHTML = html;
}

function resolveEpisodeWorkbenchAssetLibraryFromState(workbench) {
  const importedAssets = workbench.ui.importedAssets ?? {};
  return {
    character: importedAssets.character ?? [],
    scene: importedAssets.scene ?? [],
    prop: importedAssets.prop ?? [],
  };
}

function mergeGenerationState(currentState, nextState) {
  const current = currentState ?? createEmptyGenerationState();
  const next = nextState ?? createEmptyGenerationState();
  const merged = {
    ...createEmptyGenerationState(),
    ...next,
    ...current,
  };
  return {
    ...merged,
    prompt: resolveMergedGenerationPrompt(current.prompt, next.prompt),
    imagePrompt: resolveMergedGenerationPrompt(current.imagePrompt, next.imagePrompt),
    videoPrompt: resolveMergedGenerationPrompt(current.videoPrompt, next.videoPrompt),
    referenceUploads:
      (current.referenceUploads?.length ? current.referenceUploads : next.referenceUploads) ?? [],
    localReferenceRoles:
      (current.localReferenceRoles?.length ? current.localReferenceRoles : next.localReferenceRoles) ?? [],
    referenceSelections:
      (current.referenceSelections?.length ? current.referenceSelections : next.referenceSelections) ?? [],
  };
}

function resolveMergedGenerationPrompt(currentPrompt, nextPrompt) {
  const currentText = typeof currentPrompt === "string" ? currentPrompt : "";
  const nextText = typeof nextPrompt === "string" ? nextPrompt : "";
  return currentText.trim() ? currentText : nextText;
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
    "open-episode-batch-actions",
    "close-episode-batch-modal",
    "set-episode-media-mode",
    "preview-export",
    "episode-fixed-result-action",
  ]);
  if (!action || (workbench.ui.busy && !allowWhileBusy.has(action))) {
    return;
  }

  if (action === "logout") {
    workbench.ui.busy = true;
    workbench.ui.toast = "正在退出当前账号...";
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
    await syncBillingPackages(workbench);
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

  if (action === "request-enterprise-contact") {
    await runAction(workbench, "正在提交商务联系请求...", async () => {
      const response = await workbench.api.requestEnterpriseContact({
        source: "pricing_modal",
        note: "enterprise_plan_interest",
      });
      workbench.ui.toast = `商务联系请求已提交：${response.request?.id ?? "已受理"}。`;
    });
    render(workbench);
    return;
  }

  if (action === "refresh-generation-queues") {
    await runAction(workbench, "正在刷新生成队列...", async () => {
      await refreshGenerationQueues(workbench);
    }, { successToast: "队列状态已刷新。" });
    return;
  }

  if (action === "operate-generation-queue-job") {
    const operation = resolveGenerationQueueJobOperation(target);
    if (operation.jobAction === "remove") {
      workbench.ui.generationQueueJobOperationConfirm = operation;
      render(workbench);
      return;
    }
    await runAction(workbench, "正在操作队列任务...", async () => {
      await operateGenerationQueueJob(workbench, operation);
    }, { successToast: "队列任务已提交操作。" });
    return;
  }

  if (action === "operate-generation-staged-retry") {
    const operation = resolveGenerationStagedRetryOperation(target);
    await runAction(workbench, "正在提交产物保存阶段重试...", async () => {
      await operateGenerationStagedRetry(workbench, operation);
    }, { successToast: "产物保存阶段重试已提交。" });
    return;
  }

  if (action === "close-generation-queue-job-confirm") {
    workbench.ui.generationQueueJobOperationConfirm = null;
    render(workbench);
    return;
  }

  if (action === "confirm-generation-queue-job-operation") {
    const operation = workbench.ui.generationQueueJobOperationConfirm ?? null;
    if (!operation) {
      workbench.ui.toast = "缺少队列任务操作信息，请重新选择。";
      render(workbench);
      return;
    }
    await runAction(workbench, "正在操作队列任务...", async () => {
      await operateGenerationQueueJob(workbench, operation);
      workbench.ui.generationQueueJobOperationConfirm = null;
    }, { successToast: "队列任务已提交操作。" });
    return;
  }

  if (action === "purchase-billing-package") {
    const packageId = target.dataset.packageId ?? "";
    const provider = target.dataset.provider ?? "wechat_pay";
    if (!packageId) {
      workbench.ui.toast = "套餐信息缺失，请刷新后重试。";
      render(workbench);
      return;
    }

    await runAction(workbench, "正在创建支付订单...", async () => {
      const orderResponse = await workbench.api.createBillingOrder({
        creditPackageId: packageId,
      });
      const intentResponse = await workbench.api.createPaymentIntent({
        orderId: orderResponse.order.id,
        provider,
        productMode: "native_qr",
      });
      const amountMinor = Number(intentResponse?.paymentIntent?.amountMinor ?? 0);
      const amountLabel = amountMinor > 0 ? `¥${Math.round(amountMinor / 100)}` : "当前套餐";
      workbench.ui.toast = `已创建支付意图：${amountLabel}，订单号 ${intentResponse?.paymentIntent?.merchantOrderNo ?? orderResponse.order.orderNo}。`;
      workbench.ui.lastBillingOrder = orderResponse.order ?? null;
      workbench.ui.lastPaymentIntent = intentResponse?.paymentIntent ?? null;
      workbench.ui.lastPaymentAction = intentResponse?.payAction ?? null;
    });
    return;
  }

  if (action === "refresh-payment-intent") {
    const paymentIntentId = target.dataset.paymentIntentId ?? workbench.ui.lastPaymentIntent?.id ?? "";
    const orderId = target.dataset.orderId ?? workbench.ui.lastBillingOrder?.id ?? workbench.ui.lastPaymentIntent?.orderId ?? "";
    if (!paymentIntentId || !orderId) {
      workbench.ui.toast = "缺少支付单信息，请重新创建支付意图。";
      render(workbench);
      return;
    }

    await runAction(workbench, "正在刷新支付状态...", async () => {
      const [orderEnvelope, intentEnvelope] = await Promise.all([
        workbench.api.getBillingOrder(orderId),
        workbench.api.getPaymentIntent(paymentIntentId),
      ]);
      workbench.ui.lastBillingOrder = orderEnvelope?.order ?? workbench.ui.lastBillingOrder ?? null;
      workbench.ui.lastPaymentIntent = intentEnvelope?.paymentIntent ?? workbench.ui.lastPaymentIntent ?? null;
      workbench.ui.lastPaymentAction = intentEnvelope?.payAction ?? workbench.ui.lastPaymentAction ?? null;
      workbench.ui.toast = `支付状态已刷新：${workbench.ui.lastPaymentIntent?.status ?? "unknown"}。`;
    });
    return;
  }

  if (action === "show-library-placeholder") {
    const placeholderMessage = target.dataset.placeholderMessage ?? "该资产库能力暂未开放。";
    workbench.ui.toast = placeholderMessage;
    render(workbench);
    return;
  }

  if (action === "reset-team-member-filters") {
    workbench.ui.teamMemberSearchQuery = "";
    workbench.ui.teamMemberRoleFilter = "all";
    workbench.ui.teamMemberStatusFilter = "all";
    workbench.ui.toast = "已重置成员筛选条件。";
    render(workbench);
    return;
  }

  if (action === "search-team-members") {
    workbench.ui.toast = "";
    render(workbench, { preserveLibraryScroll: true });
    return;
  }

  if (action === "open-library-upload") {
    workbench.ui.activeNavTab = "project";
    workbench.ui.projectPanelMode = "workspace";
    workbench.ui.projectInteriorSection = "assets";
    workbench.ui.projectAssetTab = "character";
    workbench.ui.assetImportModal = "character";
    workbench.ui.assetImportModalTab = "local";
    workbench.ui.assetImportCategory = "domestic-modern-city";
    workbench.ui.assetImportDrafts = [];
    workbench.ui.assetImportSelection = [];
    workbench.ui.assetImportOfficialAssets = resolveAssetImportLibraryRecords(workbench, "character");
    workbench.ui.toast = "已进入项目资产页，可直接上传角色素材。";
    window.location.hash = "project-workspace";
    render(workbench);
    return;
  }

  if (action === "open-library-generate") {
    workbench.ui.activeNavTab = "project";
    workbench.ui.projectPanelMode = "workspace";
    workbench.ui.projectInteriorSection = "assets";
    workbench.ui.projectAssetTab = "character";
    workbench.ui.assetGeneratorModal = "character";
    workbench.ui.assetGeneratorMode = "generate";
    workbench.ui.assetGeneratorEditingAsset = null;
    workbench.ui.toast = "已进入项目资产页，可直接生成角色资产。";
    window.location.hash = "project-workspace";
    render(workbench);
    return;
  }

  if (action === "set-library-asset-scope") {
    cancelAssetLibrarySearch(workbench);
    workbench.ui.activeNavTab = "library";
    workbench.ui.libraryTeamAssetScope = target.dataset.assetScope ?? "official";
    if (
      (workbench.ui.libraryTeamAssetScope === "official" || !workbench.ui.libraryTeamAssetScope) &&
      !isApiBackedLibraryCategory(workbench.ui.libraryCategory)
    ) {
      workbench.ui.libraryCategory = "character";
    }
    workbench.ui.libraryCategory = workbench.ui.libraryCategory || "character";
    workbench.ui.libraryFolder = workbench.ui.libraryFolder || "";
    workbench.ui.libraryQuery = "";
    workbench.ui.libraryAssetSearchQuery = "";
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
    const category = target.dataset.libraryCategory ?? target.dataset.category ?? "character";
    workbench.ui.activeNavTab = "library";
    workbench.ui.libraryCategory = category;
    workbench.ui.libraryFolder = "";
    workbench.ui.libraryQuery = "";
    workbench.ui.libraryAssetSearchQuery = "";
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
    const folder = target.dataset.libraryFolder ?? "";
    workbench.ui.libraryFolder = folder;
    workbench.ui.libraryQuery = "";
    workbench.ui.libraryAssetSearchQuery = "";
    workbench.ui.libraryLoading = shouldFetchAssetLibrary(workbench);
    workbench.ui.libraryDetailAssetId = "";
    workbench.ui.libraryDetailView = "turnaround";
    render(workbench);
    await syncAssetLibraryFromApi(workbench);
    render(workbench);
    return;
  }

  if (action === "select-library-asset") {
    const assetId = target.dataset.libraryAssetId ?? "";
    workbench.ui.selectedLibraryAssetId = assetId || null;
    render(workbench);
    return;
  }

  if (action === "toggle-library-import-selection") {
    const assetId = target.dataset.libraryAssetId ?? "";
    workbench.ui.selectedLibraryImportIds = toggleSelection(
      workbench.ui.selectedLibraryImportIds ?? [],
      assetId,
    );
    if (!workbench.ui.selectedLibraryAssetId) {
      workbench.ui.selectedLibraryAssetId = assetId || null;
    }
    render(workbench);
    return;
  }

  if (action === "import-selected-library-assets") {
    const selectedIds = [...new Set(workbench.ui.selectedLibraryImportIds ?? [])].filter(Boolean);
    if (!selectedIds.length) {
      workbench.ui.toast = "请先选择要导入的资产。";
      render(workbench);
      return;
    }
    workbench.ui.activeNavTab = "project";
    workbench.ui.projectPanelMode = "workspace";
    workbench.ui.projectInteriorSection = "assets";
    workbench.ui.projectAssetTab = getLibraryTypeByCategory(workbench.ui.libraryCategory ?? "角色");
    workbench.ui.assetImportModal = workbench.ui.projectAssetTab;
    workbench.ui.assetImportModalTab = "official";
    workbench.ui.assetImportCategory = workbench.ui.libraryFolder ?? "国内仿真人-现代都市";
    workbench.ui.assetImportDrafts = [];
    workbench.ui.assetImportSelection = selectedIds;
    workbench.ui.assetImportOfficialAssets = getLibraryAssetsForImport({
      assetKind: workbench.ui.projectAssetTab,
      folder: workbench.ui.assetImportCategory,
      searchQuery: workbench.ui.libraryQuery ?? "",
    });
    workbench.ui.toast = `已带入 ${selectedIds.length} 项资产，可继续确认导入。`;
    window.location.hash = "project-workspace";
    render(workbench);
    return;
  }

  if (action === "refresh-team") {
    await syncProjectInteriorSupplementary(workbench);
    workbench.ui.toast = "团队数据已刷新。";
    render(workbench);
    await syncAssetLibraryFromApi(workbench);
    render(workbench);
    return;
  }

  if (action === "clear-library-search") {
    cancelAssetLibrarySearch(workbench);
    workbench.ui.activeNavTab = "library";
    workbench.ui.libraryQuery = "";
    workbench.ui.libraryAssetSearchQuery = "";
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
    workbench.ui.toast = removed ? "已从当前列表移除。" : "未找到要删除的团队素材。";
    render(workbench, { preserveLibraryScroll: true });
    return;
  }

  if (action === "refresh-team") {
    workbench.ui.busy = true;
    workbench.ui.toast = "正在刷新团队数据...";
    render(workbench);
    await loadTeamSurface(workbench);
    workbench.ui.busy = false;
    workbench.ui.toast = workbench.ui.teamError ? `团队数据加载失败：${workbench.ui.teamError}` : "团队数据已刷新。";
    render(workbench);
    return;
  }

  if (action === "open-team-member-create") {
    const overview = workbench.ui.teamOverview;
    if (overview?.entitlements?.teamMemberManagement !== true) {
      workbench.ui.isLibraryPricingModalOpen = true;
      render(workbench);
      return;
    }
    if (Number(overview?.seats?.remaining ?? 0) <= 0) {
      workbench.ui.isLibraryPricingModalOpen = true;
      workbench.ui.toast = "团队席位已满，扩容后才能继续创建成员账号。";
      render(workbench);
      return;
    }
    if (overview?.permissions?.canCreateMember === false) {
      workbench.ui.toast = "当前账号没有创建成员权限，请联系主账号或团队管理员。";
      render(workbench);
      return;
    }
    workbench.ui.isTeamMemberCreateOpen = true;
    workbench.ui.teamMemberCreateNotice = "";
    workbench.ui.teamTemporaryPassword = "";
    render(workbench);
    return;
  }

  if (action === "close-team-member-create") {
    workbench.ui.isTeamMemberCreateOpen = false;
    workbench.ui.teamMemberCreateNotice = "";
    workbench.ui.teamTemporaryPassword = "";
    render(workbench);
    return;
  }

  if (action === "submit-team-member-create") {
    await submitTeamMemberCreate(workbench);
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

  if (action === "open-create-member") {
    workbench.ui.createMemberModal = {
      open: true,
      phone: "",
      role: "creator",
      note: "",
      notice: "",
    };
    render(workbench);
    return;
  }

  if (action === "close-create-member") {
    workbench.ui.createMemberModal = null;
    render(workbench);
    return;
  }

  if (action === "open-edit-member") {
    const memberId = target.dataset.memberId ?? "";
    const member = (workbench.ui.projectMembers ?? []).find((item) => item.id === memberId);
    if (!member) {
      workbench.ui.toast = "未找到要编辑的成员，请刷新后重试。";
      render(workbench);
      return;
    }
    workbench.ui.editMemberModal = {
      open: true,
      id: member.id,
      phone: member.phone ?? "",
      role: member.role ?? "creator",
      note: member.note ?? "",
      status: member.status ?? "enabled",
      notice: "",
    };
    render(workbench);
    return;
  }

  if (action === "close-edit-member") {
    workbench.ui.editMemberModal = null;
    render(workbench);
    return;
  }

  if (action === "change-create-member-phone") {
    workbench.ui.createMemberModal = {
      ...(workbench.ui.createMemberModal ?? { open: true, role: "creator", note: "", notice: "" }),
      phone: target.value,
      notice: "",
    };
    return;
  }

  if (action === "change-create-member-role") {
    workbench.ui.createMemberModal = {
      ...(workbench.ui.createMemberModal ?? { open: true, phone: "", note: "", notice: "" }),
      role: target.value || "creator",
      notice: "",
    };
    render(workbench);
    return;
  }

  if (action === "change-create-member-note") {
    workbench.ui.createMemberModal = {
      ...(workbench.ui.createMemberModal ?? { open: true, phone: "", role: "creator", notice: "" }),
      note: target.value,
      notice: "",
    };
    return;
  }

  if (action === "change-edit-member-role") {
    workbench.ui.editMemberModal = {
      ...(workbench.ui.editMemberModal ?? { open: true, id: "", phone: "", note: "", status: "enabled", notice: "" }),
      role: target.value || "creator",
      notice: "",
    };
    render(workbench);
    return;
  }

  if (action === "change-edit-member-note") {
    workbench.ui.editMemberModal = {
      ...(workbench.ui.editMemberModal ?? { open: true, id: "", phone: "", role: "creator", status: "enabled", notice: "" }),
      note: target.value,
      notice: "",
    };
    return;
  }

  if (action === "submit-create-member") {
    const projectId = resolveActiveProjectId(workbench) ?? "";
    const draft = workbench.ui.createMemberModal ?? {};
    if (!projectId) {
      workbench.ui.createMemberModal = {
        ...draft,
        open: true,
        notice: "缺少项目上下文，请先进入项目后再创建成员。",
      };
      render(workbench);
      return;
    }

    await runAction(workbench, "正在创建成员账号...", async () => {
      const response = await workbench.api.createProjectMember(projectId, {
        phone: draft.phone ?? "",
        role: draft.role ?? "creator",
        note: draft.note ?? "",
      });
      workbench.ui.createMemberModal = null;
      await syncProjectInteriorSupplementary(workbench);
      workbench.ui.toast = `已创建成员：${response.member?.phone ?? draft.phone ?? ""}`;
    });
    return;
  }

  if (action === "toggle-member-status") {
    const projectId = resolveActiveProjectId(workbench) ?? "";
    const draft = workbench.ui.editMemberModal ?? {};
    if (!projectId || !draft.id) {
      workbench.ui.toast = "缺少成员上下文，请刷新后重试。";
      render(workbench);
      return;
    }

    const nextStatus = draft.status === "disabled" ? "active" : "disabled";
    await runAction(workbench, nextStatus === "disabled" ? "正在停用成员..." : "正在恢复成员...", async () => {
      const response = await workbench.api.updateProjectMember(projectId, draft.id, {
        status: nextStatus,
      });
      workbench.ui.editMemberModal = {
        ...(workbench.ui.editMemberModal ?? draft),
        open: true,
        status: response.member?.status ?? (nextStatus === "disabled" ? "disabled" : "enabled"),
        notice: nextStatus === "disabled" ? "该成员已停用。" : "该成员已恢复。",
      };
      await syncProjectInteriorSupplementary(workbench);
      workbench.ui.toast = nextStatus === "disabled" ? "成员已停用。" : "成员已恢复。";
    });
    return;
  }

  if (action === "submit-edit-member") {
    const projectId = resolveActiveProjectId(workbench) ?? "";
    const draft = workbench.ui.editMemberModal ?? {};
    if (!projectId || !draft.id) {
      workbench.ui.toast = "缺少成员上下文，请刷新后重试。";
      render(workbench);
      return;
    }

    await runAction(workbench, "正在保存成员信息...", async () => {
      const response = await workbench.api.updateProjectMember(projectId, draft.id, {
        role: draft.role ?? "creator",
        note: draft.note ?? "",
      });
      workbench.ui.editMemberModal = {
        ...(workbench.ui.editMemberModal ?? draft),
        open: true,
        role: response.member?.role ?? draft.role ?? "creator",
        note: response.member?.note ?? draft.note ?? "",
        status: response.member?.status ?? draft.status ?? "enabled",
        notice: "成员信息已更新。",
      };
      await syncProjectInteriorSupplementary(workbench);
      workbench.ui.toast = "成员信息已更新。";
    });
    return;
  }

  if (action === "open-team-dashboard") {
    workbench.ui.activeNavTab = "team";
    workbench.ui.libraryTeamRoute = "team-dashboard";
    workbench.ui.teamDashboardTab = "member-consumption";
    workbench.ui.teamDashboardDateRange = "today";
    workbench.ui.isLibraryPricingModalOpen = false;
    workbench.ui.isMemberRulesModalOpen = false;
    workbench.ui.createMemberModal = null;
    workbench.ui.editMemberModal = null;
    workbench.ui.selectedDashboardMemberId = workbench.ui.projectMembers?.[0]?.id ?? null;
    workbench.ui.toast = "已进入团队概览。";
    window.location.hash = "team-dashboard";
    render(workbench);
    return;
  }

  if (action === "set-team-dashboard-tab") {
    workbench.ui.activeNavTab = "team";
    workbench.ui.libraryTeamRoute = "team-dashboard";
    workbench.ui.teamDashboardTab = normalizeTeamDashboardTab(target.dataset.dashboardTab);
    workbench.ui.toast = "已切换团队数据看板。";
    window.location.hash = teamDashboardHash(workbench.ui.teamDashboardTab);
    render(workbench, { preserveLibraryScroll: true });
    return;
  }

  if (action === "set-team-dashboard-date-range") {
    workbench.ui.activeNavTab = "team";
    workbench.ui.libraryTeamRoute = "team-dashboard";
    workbench.ui.teamDashboardDateRange = normalizeTeamDashboardDateRange(
      target.dataset.dashboardDateRange,
    );
    workbench.ui.toast = "";
    render(workbench, { preserveLibraryScroll: true });
    return;
  }

  if (action === "back-to-team-page") {
    workbench.ui.activeNavTab = "team";
    workbench.ui.libraryTeamRoute = "team";
    workbench.ui.teamDashboardTab = "member-consumption";
    workbench.ui.teamDashboardDateRange = "today";
    await loadTeamSurface(workbench);
    workbench.ui.toast = "已返回团队管理。";
    window.location.hash = "team";
    render(workbench);
    return;
  }

  if (action === "set-team-dashboard-tab") {
    workbench.ui.teamDashboardTab = target.dataset.dashboardTab ?? "member-consumption";
    workbench.ui.selectedDashboardMemberId = workbench.ui.projectMembers?.[0]?.id ?? null;
    render(workbench);
    return;
  }

  if (action === "set-team-dashboard-date-shortcut") {
    workbench.ui.teamDashboardDateShortcut = target.dataset.dashboardDateShortcut ?? "今天";
    render(workbench);
    return;
  }

  if (action === "set-team-dashboard-role-filter") {
    workbench.ui.teamDashboardRoleFilter = target.value || "all";
    workbench.ui.selectedDashboardMemberId = workbench.ui.projectMembers?.[0]?.id ?? null;
    render(workbench);
    return;
  }

  if (action === "set-team-dashboard-status-filter") {
    workbench.ui.teamDashboardStatusFilter = target.value || "all";
    workbench.ui.selectedDashboardMemberId = workbench.ui.projectMembers?.[0]?.id ?? null;
    render(workbench);
    return;
  }

  if (action === "view-team-dashboard-member") {
    workbench.ui.selectedDashboardMemberId = target.dataset.memberId ?? null;
    render(workbench);
    return;
  }

  if (action === "export-team-dashboard") {
    const projectId = resolveActiveProjectId(workbench) ?? "";
    if (!projectId) {
      workbench.ui.toast = "缺少项目上下文，无法导出团队看板。";
      render(workbench);
      return;
    }
    const url = workbench.api.getProjectTeamDashboardExportUrl(projectId, {
      tab: workbench.ui.teamDashboardTab,
      dateShortcut: workbench.ui.teamDashboardDateShortcut,
      role: workbench.ui.teamDashboardRoleFilter,
      status: workbench.ui.teamDashboardStatusFilter,
    });
    triggerBrowserDownload(
      url,
      normalizeDownloadName(
        `team-dashboard-${workbench.ui.teamDashboardTab ?? "member-consumption"}`,
        ".csv",
      ),
    );
    workbench.ui.toast = "团队看板导出已开始。";
    render(workbench);
    return;
  }

  if (action === "set-nav-tab") {
    workbench.ui.activeNavTab = target.dataset.tab ?? "home";
    workbench.ui.projectPanelMode =
      workbench.ui.activeNavTab === "project" ? "library" : workbench.ui.projectPanelMode;
    if (workbench.ui.activeNavTab === "team") {
      workbench.ui.libraryTeamRoute = "team";
      workbench.ui.teamDashboardTab = "member-consumption";
      workbench.ui.teamDashboardDateRange = "today";
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
    if (workbench.ui.activeNavTab === "team") {
      await loadTeamSurface(workbench);
    }
    render(workbench);
    return;
  }

  if (action === "open-create-modal") {
    workbench.ui.isCreateModalOpen = true;
    workbench.ui.createProjectNotice = "";
    workbench.ui.createProjectName = "";
    workbench.ui.createAspectRatio = "9:16";
    workbench.ui.createProjectType = resolveDefaultProjectStyleCode(workbench);
    workbench.ui.isProjectStyleMenuOpen = false;
    await syncProjectStyles(workbench);
    workbench.ui.createProjectType = resolveProjectStyleSelection(workbench);
    render(workbench);
    return;
  }

  if (action === "close-create-modal") {
    workbench.ui.isCreateModalOpen = false;
    workbench.ui.createProjectNotice = "";
    workbench.ui.isProjectStyleMenuOpen = false;
    render(workbench);
    return;
  }

  if (action === "toggle-project-style-menu") {
    workbench.ui.isProjectStyleMenuOpen = !workbench.ui.isProjectStyleMenuOpen;
    render(workbench);
    return;
  }

  if (action === "select-project-style") {
    workbench.ui.createProjectType = target.dataset.value ?? resolveDefaultProjectStyleCode(workbench);
    workbench.ui.isProjectStyleMenuOpen = false;
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

    await runAction(workbench, statusForAction("create-project"), async () => {
      const name = draft.fileName.trim();
      const created = await workbench.api.createProject(buildProjectCreateRequest({
        name,
        aspectRatio: "9:16",
        projectType: "anime",
        scriptInput: buildOriginalScriptPlanSeed(draft),
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

      const createdDetail =
        created?.body?.state?.projectDetail ??
        created?.state?.projectDetail ??
        null;
      if (createdDetail?.project) {
        applyProjectDetail(workbench, createdDetail);
      } else if (createdProject?.id) {
        applyProjectDetail(workbench, await loadProjectDetailForWorkbench(workbench, createdProject.id));
      }

      workbench.ui.projectLibraryPage = 1;
      workbench.ui.activeNavTab = "script";
      workbench.ui.projectPanelMode = "library";
      workbench.ui.isOriginalScriptModalOpen = false;
      workbench.ui.isScriptModalOpen = false;
      workbench.ui.uploadNotice = "";
      workbench.ui.toast = "AI 原创剧本项目已创建，可继续拆镜或进入剧集工作台。";
      window.location.hash = "script";
    });
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
    stopLipSyncAudioPreview(workbench);
    workbench.ui.selectedStoryboardId = target.dataset.storyboardId ?? null;
    workbench.ui.isStoryboardDescriptionModalOpen = false;
    normalizeStoryboardComposerState(workbench, workbench.ui.selectedStoryboardId);
    await loadSelectedStoryboardConversationHistory(workbench, {
      storyboardId: workbench.ui.selectedStoryboardId,
      mediaKind: resolveStoryboardConversationMediaKind(workbench),
    });
    syncPromptFromCurrentScope(workbench);
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
    clearAssetPromptDraftForCurrentSelection(workbench);
    await loadSelectedAssetConversationHistory(workbench, { assetId, mediaKind: "image" });
    syncPromptFromCurrentScope(workbench);
    renderPreservingEpisodeAssetScroll(workbench);
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
    renderPreservingEpisodeAssetScroll(workbench);
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

  if (action === "toggle-storyboard-selection") {
    const storyboardId = target.dataset.storyboardId ?? "";
    const current = new Set(workbench.ui.selectedStoryboardIds ?? []);
    if (current.has(storyboardId)) {
      current.delete(storyboardId);
    } else if (storyboardId) {
      current.add(storyboardId);
    }
    workbench.ui.selectedStoryboardIds = [...current];
    render(workbench);
    return;
  }

  if (action === "toggle-storyboard-select-all") {
    const storyboardIds = getActiveStoryboards(workbench).map((item) => item.id).filter(Boolean);
    const isAllSelected =
      storyboardIds.length > 0 &&
      storyboardIds.every((id) => (workbench.ui.selectedStoryboardIds ?? []).includes(id));
    workbench.ui.selectedStoryboardIds = isAllSelected ? [] : [...storyboardIds];
    render(workbench);
    return;
  }

  if (action === "open-episode-voice-modal") {
    const voiceScope = target.dataset.voiceScope ?? "asset";
    if (voiceScope === "lip-sync") {
      workbench.ui.episodeVoiceModal = {
        scope: "lip-sync",
        assetId: "",
        assetName: getSelectedStoryboard(
          getActiveStoryboards(workbench),
          workbench.ui.selectedStoryboardId,
        )?.title ?? "当前分镜",
        assetKind: "character",
        voiceId: workbench.ui.lipSyncVoiceId ?? null,
        voiceName: workbench.ui.lipSyncVoiceName ?? "",
        tab: workbench.ui.lipSyncVoiceSource === "system" ? "system" : "custom",
        previewVoiceName: "",
      };
      render(workbench);
      return;
    }
    const assetId = target.dataset.assetId ?? "";
    const currentCharacterAsset = findImportedAsset(workbench.ui.importedAssets, "character", "image", assetId);
    const assetName = target.dataset.assetName ?? "角色";
    const inferredVoiceSource = inferEpisodeVoiceSource(currentCharacterAsset);
    workbench.ui.episodeVoiceModal = {
      scope: "asset",
      assetId,
      assetName,
      assetKind: target.dataset.assetKind ?? "character",
      voiceId: currentCharacterAsset?.voiceId ?? null,
      voiceName: currentCharacterAsset?.voiceName ?? "",
      tab: inferredVoiceSource === "system" ? "system" : "custom",
      previewVoiceName: "",
    };
    render(workbench);
    return;
  }

  if (action === "set-episode-voice-tab") {
    stopEpisodeVoicePreview(workbench);
    workbench.ui.episodeVoiceModal = {
      ...(workbench.ui.episodeVoiceModal ?? {}),
      tab: target.dataset.tab ?? "custom",
      previewVoiceName: "",
    };
    render(workbench);
    return;
  }

  if (action === "preview-episode-voice") {
    const voiceName = target.dataset.voiceName ?? "";
    if (!voiceName) {
      return;
    }
    if (workbench.ui.episodeVoiceModal?.previewVoiceName === voiceName) {
      stopEpisodeVoicePreview(workbench);
      workbench.ui.episodeVoiceModal = {
        ...(workbench.ui.episodeVoiceModal ?? {}),
        previewVoiceName: "",
      };
      render(workbench);
      return;
    }
    playEpisodeVoicePreview(workbench, voiceName);
    workbench.ui.episodeVoiceModal = {
      ...(workbench.ui.episodeVoiceModal ?? {}),
      previewVoiceName: voiceName,
    };
    render(workbench);
    return;
  }

  if (action === "preview-lip-sync-audio") {
    const audioId = target.dataset.audioId ?? "";
    if (!audioId) {
      return;
    }
    const item = (workbench.ui.lipSyncAudioItems ?? []).find((candidate) => candidate?.id === audioId);
    if (!item) {
      return;
    }
    if (workbench.ui.lipSyncPreviewAudioId === audioId) {
      stopLipSyncAudioPreview(workbench);
      render(workbench);
      return;
    }
    playLipSyncAudioPreview(workbench, item);
    render(workbench);
    return;
  }

  if (action === "select-episode-voice") {
    const modal = workbench.ui.episodeVoiceModal;
    const voiceId = target.dataset.voiceId ?? null;
    const voiceName = target.dataset.voiceName ?? "";
    const voiceSource = target.dataset.voiceSource ?? modal?.tab ?? "custom";
    if (!modal?.assetId || !voiceName) {
      if (modal?.scope !== "lip-sync") {
        return;
      }
    }
    if (modal?.scope === "lip-sync") {
      workbench.ui.lipSyncVoiceId = voiceId;
      workbench.ui.lipSyncVoiceName = voiceName;
      workbench.ui.lipSyncVoiceSource = voiceSource;
      stopEpisodeVoicePreview(workbench);
      workbench.ui.episodeVoiceModal = null;
      await persistLipSyncStoryboardDraft(workbench, { silent: true });
      workbench.ui.toast = `已选择对口型音色 ${voiceName}。`;
      render(workbench);
      return;
    }
    if (
      isRealEpisodeWorkbench(workbench) &&
      typeof workbench.api.updateEpisodeAsset === "function" &&
      isUuidLike(modal.assetId)
    ) {
      await runAction(workbench, "正在保存角色音色...", async () => {
        await workbench.api.updateEpisodeAsset(workbench.ui.selectedEpisodeId, modal.assetId, {
          voiceId,
          voiceName,
          voiceSource,
        });
        await ensureEpisodeWorkbenchAssetsHydrated(workbench);
      });
      stopEpisodeVoicePreview(workbench);
      workbench.ui.episodeVoiceModal = null;
      workbench.ui.selectedEpisodeAssetId = modal.assetId;
      workbench.ui.toast = `已为 ${modal.assetName ?? "当前角色"} 设置音色 ${voiceName}。`;
      render(workbench);
      return;
    }
    const nextAssets = cloneImportedAssets(workbench.ui.importedAssets);
    nextAssets.character = (nextAssets.character ?? []).map((item) =>
      item.id === modal.assetId ? { ...item, voiceId, voiceName, voiceSource } : item,
    );
    workbench.ui.importedAssets = nextAssets;
    stopEpisodeVoicePreview(workbench);
    workbench.ui.episodeVoiceModal = null;
    workbench.ui.toast = `已为 ${modal.assetName ?? "当前角色"} 选择音色 ${voiceName}。`;
    render(workbench);
    return;
  }

  if (action === "close-episode-voice-modal") {
    stopEpisodeVoicePreview(workbench);
    workbench.ui.episodeVoiceModal = null;
    render(workbench);
    return;
  }

  if (action === "open-delete-episode-asset-modal") {
    const assetId = target.dataset.assetId ?? "";
    const assetKind = target.dataset.assetKind ?? workbench.ui.projectAssetTab ?? "character";
    const assetName = target.dataset.assetName ?? "";
    workbench.ui.assetInspector = {
      ...(workbench.ui.assetInspector ?? {}),
      episodeDeleteAssetTarget: {
        assetId,
        assetKind,
        assetName,
      },
    };
    render(workbench);
    return;
  }

  if (action === "save-episode-asset-to-library") {
    const assetId = target.dataset.assetId ?? "";
    const assetKind = target.dataset.assetKind ?? workbench.ui.projectAssetTab ?? "character";
    const assetLabel = assetKind === "scene" ? "场景" : assetKind === "prop" ? "道具" : "角色";
    const assetRecord = findEpisodeAssetById(workbench, assetKind, assetId);
    if (!assetRecord?.preview && !assetRecord?.previewUrl && !assetRecord?.fixedImageFileId) {
      workbench.ui.toast = "没有图片无法保存在资产库";
      render(workbench);
      return;
    }
    if (
      !isRealEpisodeWorkbench(workbench) ||
      typeof workbench.api.saveEpisodeAssetToLibrary !== "function" ||
      !isUuidLike(assetId)
    ) {
      workbench.ui.toast = "当前剧集资产库保存能力还未接通。";
      render(workbench);
      return;
    }
    let savedAssetId = null;
    await runAction(workbench, "正在保存到资产库...", async () => {
      const result = await workbench.api.saveEpisodeAssetToLibrary(workbench.ui.selectedEpisodeId, assetId);
      savedAssetId = result?.asset?.id ?? null;
      if (!savedAssetId) {
        throw new Error("ASSET_ALREADY_EXISTS");
      }
      if (workbench.ui.selectedProjectCardId && typeof workbench.api.getProjectDetail === "function") {
        applyProjectDetail(
          workbench,
          await workbench.api.getProjectDetail(workbench.ui.selectedProjectCardId),
        );
      }
    });
    workbench.ui.toast = "添加成功";
    prepareAssetLibraryReturn(workbench, {
      assetKind,
      mediaType: "image",
      assetIds: savedAssetId ? [savedAssetId] : [],
      count: savedAssetId ? 1 : 0,
    });
    render(workbench);
    return;
  }

  if (action === "close-delete-episode-asset-modal") {
    if (workbench.ui.assetInspector) {
      workbench.ui.assetInspector = {
        ...workbench.ui.assetInspector,
        episodeDeleteAssetTarget: null,
      };
    }
    render(workbench);
    return;
  }

  if (action === "confirm-delete-episode-asset") {
    const draft = workbench.ui.assetInspector?.episodeDeleteAssetTarget;
    if (!draft?.assetId) {
      return;
    }
    const resolveNextSelection = () => {
      const nextAssets = workbench.ui.importedAssets ?? {};
      const candidates = [
        ...(nextAssets[draft.assetKind] ?? []),
        ...(nextAssets.character ?? []),
        ...(nextAssets.scene ?? []),
        ...(nextAssets.prop ?? []),
      ].filter((item) => item.id !== draft.assetId);
      return candidates[0]?.id ?? null;
    };
    if (
      isRealEpisodeWorkbench(workbench) &&
      typeof workbench.api.deleteEpisodeAsset === "function" &&
      isUuidLike(draft.assetId)
    ) {
      await runAction(workbench, "正在删除剧集素材...", async () => {
        await workbench.api.deleteEpisodeAsset(workbench.ui.selectedEpisodeId, draft.assetId);
        await ensureEpisodeWorkbenchAssetsHydrated(workbench);
      });
      const nextSelection = resolveNextSelection();
      workbench.ui.selectedEpisodeAssetId = nextSelection;
      workbench.ui.selectedEpisodeCardId = nextSelection;
      workbench.ui.selectedEpisodeAssetIds = (workbench.ui.selectedEpisodeAssetIds ?? []).filter((id) => id !== draft.assetId);
      workbench.ui.assetInspector = {
        ...(workbench.ui.assetInspector ?? {}),
        episodeDeleteAssetTarget: null,
      };
      workbench.ui.toast = draft.assetName ? `已删除 ${draft.assetName}。` : "已删除当前素材。";
      render(workbench);
      return;
    }
    const nextAssets = cloneImportedAssets(workbench.ui.importedAssets);
    nextAssets[draft.assetKind] = (nextAssets[draft.assetKind] ?? []).filter((item) => item.id !== draft.assetId);
    workbench.ui.importedAssets = nextAssets;
    const nextSelection = resolveNextSelection();
    workbench.ui.selectedEpisodeAssetId = nextSelection;
    workbench.ui.selectedEpisodeCardId = nextSelection;
    workbench.ui.selectedEpisodeAssetIds = (workbench.ui.selectedEpisodeAssetIds ?? []).filter((id) => id !== draft.assetId);
    workbench.ui.assetInspector = {
      ...(workbench.ui.assetInspector ?? {}),
      episodeDeleteAssetTarget: null,
    };
    workbench.ui.toast = draft.assetName ? `已删除 ${draft.assetName}。` : "已删除当前素材。";
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
    const episodeAssetTypeMap = {
      character: "role",
      scene: "scene",
      prop: "prop",
    };
    if (
      isRealEpisodeWorkbench(workbench) &&
      typeof workbench.api.createEpisodeAsset === "function" &&
      Object.prototype.hasOwnProperty.call(episodeAssetTypeMap, nextType)
    ) {
      let createdAssetId = null;
      await runAction(workbench, "正在创建剧集素材...", async () => {
        const created = await workbench.api.createEpisodeAsset(workbench.ui.selectedEpisodeId, {
          assetType: episodeAssetTypeMap[nextType],
          name: nextName,
        });
        createdAssetId = created?.asset?.assetId ?? null;
        await ensureEpisodeWorkbenchAssetsHydrated(workbench);
        applyManualAssetDraftDefaults(workbench, nextType, createdAssetId, nextName);
      }, { successToast: "" });
      workbench.ui.projectAssetTab = nextType;
      workbench.ui.selectedEpisodeAssetId = createdAssetId ?? workbench.ui.selectedEpisodeAssetId;
      workbench.ui.selectedEpisodeCardId = createdAssetId ?? workbench.ui.selectedEpisodeCardId;
      workbench.ui.episodeWorkbenchScrollTarget = nextType;
      workbench.ui.episodeAssetCreateModal = null;
      workbench.ui.toast = "";
      render(workbench);
      return;
    }
    const nextEntry = {
      id: `manual-${nextType}-${Date.now().toString(36)}`,
      name: nextName,
      preview: "",
      description: buildManualAssetDefaultDescription(nextType, nextName),
      kind: nextType,
      source: "manual",
      voiceName: nextType === "character" ? "" : undefined,
      voiceSource: nextType === "character" ? "custom" : undefined,
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
    workbench.ui.selectedEpisodeCardId = nextEntry.id;
    workbench.ui.episodeWorkbenchScrollTarget = nextType;
    workbench.ui.episodeAssetCreateModal = null;
    workbench.ui.toast = "";
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
      workbench.ui.toast = "当前视频已设为分镜视频，请先取消后再删除。";
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
      await runAction(workbench, "正在保存分镜描述...", async () => {
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
    stopLipSyncAudioPreview(workbench);
    workbench.ui.museScopeMode = target.dataset.mode ?? "storyboard";
    if (workbench.ui.museScopeMode === "assets") {
      workbench.ui.episodeMediaMode = "image";
      workbench.ui.selectedModelId = resolveConfiguredImageModelCode(
        workbench,
        workbench.ui.imageGenerationMode,
        "gpt-image-2-cn",
      );
      workbench.ui.videoAudioEnabled = false;
      workbench.ui.videoMusicEnabled = false;
      workbench.ui.videoLipSyncEnabled = false;
      await ensureEpisodeWorkbenchAssetsHydrated(workbench);
      const assetId = workbench.ui.selectedEpisodeAssetId ?? workbench.ui.selectedEpisodeCardId ?? null;
      clearAssetPromptDraftForCurrentSelection(workbench);
      await loadSelectedAssetConversationHistory(workbench, { assetId, mediaKind: "image" });
    } else {
      if ((workbench.ui.episodeMediaMode ?? "image") === "image") {
        workbench.ui.episodeMediaMode = "video";
      }
      normalizeStoryboardComposerState(workbench, workbench.ui.selectedStoryboardId);
      await loadSelectedStoryboardConversationHistory(workbench, {
        mediaKind: resolveStoryboardConversationMediaKind(workbench),
      });
    }
    syncPromptFromCurrentScope(workbench);
    render(workbench);
    return;
  }

  if (action === "toggle-muse-prompt-menu") {
    const menu = target.dataset.menu ?? "";
    workbench.ui.musePromptMenu = workbench.ui.musePromptMenu === menu ? null : menu;
    workbench.ui.isVideoModelMenuOpen = false;
    workbench.ui.openGenerationSelectMenu = null;
    renderEpisodeWorkbenchPromptDockOnly(workbench);
    return;
  }

  if (action === "select-muse-preset") {
    workbench.ui.referencePromptPreset = target.dataset.value ?? workbench.ui.referencePromptPreset;
    workbench.ui.musePromptMenu = null;
    renderEpisodeWorkbenchPromptDockOnly(workbench);
    return;
  }

  if (action === "quick-append-selected-asset") {
    const result = appendSelectedEpisodeAssetToPrompt(workbench);
    if (typeof window !== "undefined") {
      window.__lastQuickAppendDebug = {
        action,
        result,
        museScopeMode: workbench.ui.museScopeMode ?? null,
        selectedStoryboardId: workbench.ui.selectedStoryboardId ?? null,
        prompt: workbench.ui.prompt ?? "",
        storyboard: getSelectedStoryboard(getActiveStoryboards(workbench), workbench.ui.selectedStoryboardId),
      };
    }
    if (!result.ok) {
      workbench.ui.toast = result.toast ?? "当前没有可快捷引用的资产。";
      renderEpisodeWorkbenchPromptDockOnly(workbench);
      return;
    }
    renderEpisodeWorkbenchPromptDockOnly(workbench);
    return;
  }

  if (action === "remove-mention-reference") {
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
      mentionReferences: (generationState.mentionReferences ?? []).filter((item) => item.id !== referenceId),
    }));
    render(workbench);
    return;
  }

  if (action === "select-prompt-mention") {
    const assetId = target.dataset.assetId ?? "";
    const assetKind = target.dataset.assetKind ?? "character";
    const suggestion = findEpisodeAssetById(workbench, assetKind, assetId);
    if (!suggestion) {
      workbench.ui.promptMentionMenuOpen = false;
      workbench.ui.promptMentionSuggestions = [];
      render(workbench);
      return;
    }
    insertEpisodeAssetMention(workbench, suggestion, assetKind);
    workbench.ui.promptMentionMenuOpen = false;
    workbench.ui.promptMentionQuery = "";
    workbench.ui.promptMentionSuggestions = [];
    render(workbench);
    return;
  }

  if (action === "episode-fixed-result-action") {
    const resultAction = target.dataset.resultAction ?? "";
    const taskId = target.dataset.taskId ?? "";
    const imageResult = resolveAssetConversationActionResult(workbench, taskId, "image") ?? workbench.ui.imageGenerationResult;
    if (imageResult) {
      workbench.ui.imageGenerationResult = imageResult;
    }
    if (resultAction === "download") {
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
      const firstImage = Array.isArray(imageResult?.fixedImages) ? imageResult.fixedImages[0] : null;
      const selectedAssetId =
        imageResult?.selectionContext?.selectedAssetId ??
        workbench.ui.selectedEpisodeAssetId ??
        workbench.ui.selectedEpisodeCardId ??
        null;
      try {
        workbench.ui.busy = true;
        render(workbench);
        if (
          isRealEpisodeWorkbench(workbench) &&
          typeof workbench.api.deleteFileResource === "function" &&
          isUuidLike(firstImage?.storageObjectId ?? null)
        ) {
          await workbench.api.deleteFileResource(workbench.ui.selectedEpisodeId, firstImage.storageObjectId, {
            assetVersionId: firstImage.id ?? null,
            storageObjectId: firstImage.storageObjectId,
          });
        }
        if (
          isRealEpisodeWorkbench(workbench) &&
          typeof workbench.api.deleteAssetConversationTurn === "function" &&
          selectedAssetId &&
          String(imageResult?.taskId ?? "").trim()
        ) {
          const response = await workbench.api.deleteAssetConversationTurn(
            workbench.ui.selectedEpisodeId,
            selectedAssetId,
            imageResult.taskId,
            "image",
          );
          applyAssetConversationHistoryAfterDelete(
            workbench,
            selectedAssetId,
            imageResult.taskId,
            "image",
            Array.isArray(response?.entries) ? response.entries : null,
          );
        } else {
          applyAssetConversationHistoryAfterDelete(
            workbench,
            selectedAssetId,
            imageResult?.taskId ?? null,
            "image",
          );
        }
        workbench.ui.toast = "已删除当前结果。";
      } catch (error) {
        workbench.ui.toast = `删除失败：${friendlyError(error)}`;
      } finally {
        workbench.ui.busy = false;
        render(workbench);
      }
      return;
    }

    if (resultAction === "edit") {
      const promptPreview = String(imageResult?.promptPreview ?? "").trim();
      const quickReferenceItems = Array.isArray(imageResult?.quickReferenceItems)
        ? hydrateQuickReferencePreviews(workbench, imageResult.quickReferenceItems)
        : [];
      setCurrentScopePrompt(workbench, promptPreview);
      workbench.ui.assetPromptDraft = {
        ...(workbench.ui.assetPromptDraft ?? {}),
        scopeMode: "assets",
        prompt: promptPreview,
        quickReferenceItems,
        mentionReferences: [],
        selectionContext:
          imageResult?.selectionContext && typeof imageResult.selectionContext === "object"
            ? imageResult.selectionContext
            : (workbench.ui.assetPromptDraft?.selectionContext ?? {}),
      };
      workbench.ui.isStoryboardDescriptionModalOpen = false;
      workbench.ui.toast = "已回填上一次发送内容，可继续编辑。";
      render(workbench);
      return;
    }

    if (resultAction === "text-to-image") {
      workbench.ui.toast = "已切换到文字改图模式。";
      render(workbench);
      return;
    }

    if (resultAction === "set-character") {
      const firstImage = Array.isArray(imageResult?.fixedImages) ? imageResult.fixedImages[0] : null;
      const selectedImageAssetVersionId = firstImage?.assetVersionId ?? null;
      const visibleResultImageUrl = resolveVisibleFixedResultImageUrl(target);
      const fixedResultImageUrl = resolvePreferredFixedImageUrl(
        visibleResultImageUrl,
        firstImage?.url,
        imageResult?.imageUrl,
        imageResult?.thumbnailUrl,
        imageResult?.coverImageUrl,
      );
      const assetKind =
        target.dataset.assetKind ??
        imageResult?.selectionContext?.assetTab ??
        workbench.ui.assetPromptDraft?.selectionContext?.assetTab ??
        workbench.ui.projectAssetTab ??
        "character";
      if (assetKind) {
        workbench.ui.projectAssetTab = assetKind;
      }
      const selectedAssetId = resolveCurrentEpisodeAssetTargetId(workbench, imageResult, assetKind);
      const successLabel = assetKind === "scene" ? "已设为场景固定图。" : assetKind === "prop" ? "已设为道具固定图。" : "已设为角色固定图。";
      if (!(fixedResultImageUrl && selectedAssetId)) {
        workbench.ui.toast = "当前结果还不能设为固定图。";
        render(workbench);
        return;
      }
      if (
        isRealEpisodeWorkbench(workbench) &&
        typeof workbench.api.setFixedImage === "function" &&
        isUuidLike(selectedAssetId) &&
        (isUuidLike(selectedImageAssetVersionId) || firstImage.url)
      ) {
        await runAction(
          workbench,
          "正在设置角色固定图...",
          async () => {
            const result = await workbench.api.setFixedImage(
              workbench.ui.selectedEpisodeId,
              selectedAssetId,
              {
                assetVersionId: isUuidLike(selectedImageAssetVersionId) ? selectedImageAssetVersionId : null,
                storageObjectId: firstImage.storageObjectId ?? null,
                sourceUrl: fixedResultImageUrl,
                previewUrl: fixedResultImageUrl,
              },
            );
            const file = result?.file ?? {};
            const persistedAssetVersionId =
              result?.asset?.fixedImageFileId ??
              file.assetVersionId ??
              (isUuidLike(selectedImageAssetVersionId) ? selectedImageAssetVersionId : null);
            const preferredPreviewUrl = resolvePreferredFixedImageUrl(
              file.previewUrl,
              result?.asset?.fixedImageUrl,
              fixedResultImageUrl,
            );
            const preferredSourceUrl = resolvePreferredFixedImageUrl(
              file.sourceUrl,
              result?.asset?.fixedImageUrl,
              fixedResultImageUrl,
            );
            const preferredDownloadUrl = resolvePreferredFixedImageUrl(
              file.downloadUrl,
              file.sourceUrl,
              result?.asset?.fixedImageUrl,
              fixedResultImageUrl,
            );
            syncEpisodeAssetFixedImageState(workbench, selectedAssetId, {
              previewUrl: preferredPreviewUrl,
              sourceUrl: preferredSourceUrl,
              downloadUrl: preferredDownloadUrl,
              storageObjectId:
                file.storageObjectId ??
                result?.asset?.fixedImageStorageObjectId ??
                firstImage.storageObjectId ??
                null,
              assetVersionId: persistedAssetVersionId,
              fixedImageFileId: persistedAssetVersionId,
              fixedImageStorageObjectId:
                result?.asset?.fixedImageStorageObjectId ??
                file.storageObjectId ??
                firstImage.storageObjectId ??
                null,
              mimeType: file.mimeType ?? result?.file?.mimeType ?? null,
              updatedAt: result?.asset?.updatedAt ?? null,
            });
            await ensureEpisodeWorkbenchAssetsHydrated(workbench);
            workbench.ui.selectedEpisodeCardId = selectedAssetId;
            workbench.ui.selectedEpisodeAssetId = selectedAssetId;
            syncSelectedEpisodeAssetForCurrentTab(workbench);
            await loadSelectedAssetConversationHistory(workbench, {
              assetId: selectedAssetId,
              mediaKind: "image",
            });
          },
          { successToast: successLabel },
        );
        return;
      }
      syncEpisodeAssetFixedImageState(workbench, selectedAssetId, {
        previewUrl: fixedResultImageUrl,
        sourceUrl: fixedResultImageUrl,
        downloadUrl: fixedResultImageUrl,
        storageObjectId: firstImage.storageObjectId ?? null,
        assetVersionId: selectedImageAssetVersionId,
        fixedImageFileId: selectedImageAssetVersionId,
        fixedImageStorageObjectId: firstImage.storageObjectId ?? null,
      });
      workbench.ui.toast = successLabel;
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
      const selectedStoryboardId = selectedStoryboard?.id ?? workbench.ui.selectedStoryboardId ?? null;
      const editResult = resolveStoryboardConversationActionResult(
        workbench,
        target.dataset.taskId ?? "",
        mediaKind === "video" || mediaKind === "lip-sync" ? "video" : "image",
        selectedStoryboardId,
      ) ?? (mediaKind === "video" || mediaKind === "lip-sync"
        ? workbench.ui.videoGenerationResult
        : workbench.ui.imageGenerationResult);
      applyStoryboardConversationEditDraft(
        workbench,
        editResult,
        selectedStoryboard ?? { id: selectedStoryboardId, description: "" },
      );
      workbench.ui.isStoryboardDescriptionModalOpen = false;
      workbench.ui.toast = "已将上一次的文案、音频和图片带入待发送框。";
      renderEpisodeWorkbenchPromptDockOnly(workbench);
      return;
    }

    if (resultAction === "set-storyboard-video") {
      const selectedStoryboardId = selectedStoryboard?.id ?? workbench.ui.selectedStoryboardId ?? null;
      const selectedResult = resolveStoryboardConversationActionResult(
        workbench,
        target.dataset.taskId ?? "",
        "video",
        selectedStoryboardId,
      ) ?? workbench.ui.videoGenerationResult;
      let video = null;
      const visibleResultVideo =
        (selectedResult?.fixedVideos ?? []).find(
          (item) => item && (item.src || item.url) && (item.assetVersionId || item.storageObjectId || item.id),
        ) ?? null;
      const selectedResultVideoId =
        visibleResultVideo?.assetVersionId ??
        visibleResultVideo?.id ??
        selectedResult?.result?.assetVersionId ??
        selectedResult?.result?.storageObjectId ??
        visibleResultVideo?.storageObjectId ??
        selectedResult?.taskId ??
        "";
      if (visibleResultVideo) {
        const existingVideo = (selectedStoryboard?.uploadedVideos ?? []).find(
          (item) => item.id === selectedResultVideoId && item.status === "ready",
        ) ?? null;
        video = {
          id: selectedResultVideoId,
          assetVersionId:
            visibleResultVideo.assetVersionId ??
            selectedResult?.result?.assetVersionId ??
            existingVideo?.assetVersionId ??
            null,
          src: visibleResultVideo.src ?? visibleResultVideo.url,
          url: visibleResultVideo.url ?? visibleResultVideo.src,
          storageObjectId:
            visibleResultVideo.storageObjectId ??
            selectedResult?.result?.storageObjectId ??
            existingVideo?.storageObjectId ??
            null,
          thumbnailSrc:
            visibleResultVideo.thumbnailSrc ??
            selectedResult?.result?.thumbnailUrl ??
            selectedResult?.thumbnailUrl ??
            existingVideo?.thumbnailSrc ??
            selectedStoryboard?.previewThumbnailUrl ??
            null,
          status: "ready",
        };
        updateStoryboardById(workbench, selectedStoryboard?.id ?? "", (currentStoryboard) => ({
          ...currentStoryboard,
          uploadedVideos: mergeStoryboardUploadedVideos(currentStoryboard.uploadedVideos ?? [], [video]),
          selectedUploadedVideoId: selectedResultVideoId,
        }));
      } else if (selectedResult?.result?.videoUrl) {
        const generatedVideoId = selectedResultVideoId;
        if (generatedVideoId) {
          const existingVideo = (selectedStoryboard?.uploadedVideos ?? []).find(
            (item) => item.id === generatedVideoId && item.status === "ready",
          ) ?? null;
          video = {
            id: generatedVideoId,
            assetVersionId: selectedResult?.result?.assetVersionId ?? existingVideo?.assetVersionId ?? null,
            src: selectedResult.result.videoUrl,
            url: selectedResult.result.videoUrl,
            storageObjectId: selectedResult?.result?.storageObjectId ?? existingVideo?.storageObjectId ?? null,
            thumbnailSrc:
              selectedResult?.result?.thumbnailUrl ??
              selectedResult?.thumbnailUrl ??
              existingVideo?.thumbnailSrc ??
              selectedStoryboard?.previewThumbnailUrl ??
              null,
            status: "ready",
          };
          updateStoryboardById(workbench, selectedStoryboard?.id ?? "", (currentStoryboard) => ({
            ...currentStoryboard,
            uploadedVideos: mergeStoryboardUploadedVideos(currentStoryboard.uploadedVideos ?? [], [video]),
            selectedUploadedVideoId: generatedVideoId,
          }));
        }
      }
      if (!video && selectedResultVideoId) {
        video = (selectedStoryboard?.uploadedVideos ?? []).find(
          (item) => item.id === selectedResultVideoId && item.status === "ready" && item.src,
        ) ?? null;
      }
      if (!video) {
        video =
          (selectedStoryboard?.uploadedVideos ?? []).find(
            (item) => item.id === (selectedStoryboard?.selectedUploadedVideoId ?? selectedStoryboard?.currentVideoAssetVersionId) && item.status === "ready" && item.src,
          ) ??
          null;
      }
      if (selectedStoryboard?.id && video?.id) {
        await setStoryboardVideoResult(
          workbench,
          selectedStoryboard.id,
          video.id,
          video,
          resolveStoryboardResultPrompt(selectedResult),
        );
        return;
      }
      workbench.ui.toast = "当前没有可设为分镜视频的结果。";
      renderEpisodeWorkbenchStageBodyOnly(workbench);
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
      return;
    }

    if (resultAction === "set-storyboard-image") {
      const selectedStoryboardId = selectedStoryboard?.id ?? workbench.ui.selectedStoryboardId ?? null;
      const selectedResult = resolveStoryboardConversationActionResult(
        workbench,
        target.dataset.taskId ?? "",
        "image",
        selectedStoryboardId,
      ) ?? workbench.ui.imageGenerationResult;
      const firstImage = Array.isArray(selectedResult?.fixedImages) ? selectedResult.fixedImages[0] : null;
      const resultImage = firstImage?.url
        ? {
            id:
              firstImage.assetVersionId ??
              firstImage.id ??
              selectedResult?.result?.assetVersionId ??
              selectedResult?.result?.storageObjectId ??
              selectedResult?.taskId ??
              "",
            src: firstImage.url,
            storageObjectId:
              firstImage.storageObjectId ??
              selectedResult?.result?.storageObjectId ??
              null,
            assetVersionId:
              firstImage.assetVersionId ??
              selectedResult?.result?.assetVersionId ??
              null,
            status: "ready",
          }
        : null;
      const imageId = resultImage?.id ?? "";
      await setStoryboardImageResult(
        workbench,
        selectedStoryboard?.id ?? "",
        imageId,
        resolveStoryboardResultPrompt(selectedResult),
        resultImage,
      );
      return;
    }

    if (resultAction === "delete") {
      const normalizedMediaKind = mediaKind === "video" || mediaKind === "lip-sync" ? "video" : "image";
      await deleteStoryboardConversationTurn(
        workbench,
        selectedStoryboard?.id ?? workbench.ui.selectedStoryboardId ?? "",
        target.dataset.taskId ?? "",
        normalizedMediaKind,
      );
      return;
    }

    workbench.ui.toast = "该结果操作暂未支持。";
    renderEpisodeWorkbenchStageBodyOnly(workbench);
    return;
  }

  if (action === "open-episode-batch-actions") {
    const storyboardScope = (workbench.ui.museScopeMode ?? "storyboard") === "storyboard";
    const mode = storyboardScope
      ? "video"
      : (
          workbench.ui.episodeMediaMode === "video" || workbench.ui.episodeMediaMode === "lip-sync"
            ? "video"
            : "image"
        );
    let items = [];
    let scope = "asset";
    if (storyboardScope) {
      const selectedIds = new Set(workbench.ui.selectedStoryboardIds ?? []);
      const storyboards = getActiveStoryboards(workbench);
      const fallbackSelected = selectedIds.size ? [] : storyboards.slice(0, 2);
      items = selectedIds.size
        ? storyboards.filter((item) => selectedIds.has(item.id)).map((item) => ({
            id: item.id,
            name: item.displayTitle ?? item.title ?? `分镜 ${item.index ?? ""}`.trim(),
            kind: "storyboard",
            references: item.references ?? [],
          }))
        : fallbackSelected.map((item) => ({
            id: item.id,
            name: item.displayTitle ?? item.title ?? `分镜 ${item.index ?? ""}`.trim(),
            kind: "storyboard",
            references: item.references ?? [],
          }));
      scope = "storyboard";
    } else {
      const selectedIds = new Set(workbench.ui.selectedEpisodeAssetIds ?? []);
      const allAssets = [
        ...(workbench.ui.importedAssets?.character ?? []),
        ...(workbench.ui.importedAssets?.scene ?? []),
        ...(workbench.ui.importedAssets?.prop ?? []),
      ];
      const fallbackSelected = selectedIds.size ? [] : allAssets.slice(0, 3);
      items = selectedIds.size
        ? allAssets.filter((item) => selectedIds.has(item.id))
        : fallbackSelected;
    }
    workbench.ui.episodeBatchModal = buildEpisodeBatchModal(workbench, {
      scope,
      mode,
      items,
    });
    collectEpisodeWorkbenchEvent(workbench, "batch.open", {
      selectedAssetIds: [...(workbench.ui.selectedEpisodeAssetIds ?? [])],
      selectedStoryboardIds: [...(workbench.ui.selectedStoryboardIds ?? [])],
      itemCount: items.length,
      items,
    });
    render(workbench);
    return;
  }

  if (action === "toggle-episode-batch-menu") {
    if (!workbench.ui.episodeBatchModal) {
      return;
    }
    const field = target.dataset.field ?? "";
    workbench.ui.episodeBatchModal = syncEpisodeBatchModal({
      ...workbench.ui.episodeBatchModal,
      openField: workbench.ui.episodeBatchModal.openField === field ? null : field,
    });
    render(workbench);
    return;
  }

  if (action === "select-episode-batch-option") {
    if (!workbench.ui.episodeBatchModal) {
      return;
    }
    const field = target.dataset.field ?? "";
    const value = target.dataset.value ?? "";
    if (!field || value.startsWith("__label__")) {
      return;
    }
    workbench.ui.episodeBatchModal = syncEpisodeBatchModal({
      ...workbench.ui.episodeBatchModal,
      [field]:
        field === "videoResolution"
          ? value.toUpperCase()
          : field === "size"
            ? value.toUpperCase()
            : value,
      openField: null,
    });
    render(workbench);
    return;
  }

  if (action === "set-episode-batch-style-tab") {
    if (!workbench.ui.episodeBatchModal) {
      return;
    }
    const styleTab = target.dataset.tab === "custom" ? "custom" : "public";
    workbench.ui.episodeBatchModal = syncEpisodeBatchModal({
      ...workbench.ui.episodeBatchModal,
      styleTab,
      selectedStyleId: styleTab === "custom" ? "custom-1" : "public-1",
    });
    render(workbench);
    return;
  }

  if (action === "select-episode-batch-style") {
    if (!workbench.ui.episodeBatchModal) {
      return;
    }
    workbench.ui.episodeBatchModal = syncEpisodeBatchModal({
      ...workbench.ui.episodeBatchModal,
      selectedStyleId: target.dataset.styleId ?? workbench.ui.episodeBatchModal.selectedStyleId,
    });
    render(workbench);
    return;
  }

  if (action === "close-episode-batch-modal") {
    workbench.ui.episodeBatchModal = null;
    render(workbench);
    return;
  }

  if (action === "submit-episode-batch-modal") {
    const modal = workbench.ui.episodeBatchModal;
    const items = Array.isArray(modal?.items) ? modal.items : [];
    if (!items.length) {
      workbench.ui.toast = "请先选择需要批量处理的素材。";
      workbench.ui.episodeBatchModal = null;
      render(workbench);
      return;
    }

    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    const mode = modal?.mode ?? "image";
    const scope = modal?.scope ?? "asset";
    if (scope === "storyboard") {
      const activeStoryboards = getActiveStoryboards(workbench);
      for (const [index, item] of items.entries()) {
        updateStoryboardById(workbench, item.id, (storyboard) => ({
          ...storyboard,
          videoStatus: "ready",
          selectedUploadedVideoId: `batch-video-${index + 1}`,
          previewVideo: `https://example.com/storyboard-batch-${index + 1}.mp4`,
          previewThumbnailUrl: `https://picsum.photos/seed/storyboard-batch-${index + 1}/320/180`,
          uploadedVideos: [
            ...((storyboard?.uploadedVideos ?? []).filter((video) => video.id !== `batch-video-${index + 1}`)),
            {
              id: `batch-video-${index + 1}`,
              fileName: `${item.name ?? "storyboard"}.mp4`,
              src: `https://example.com/storyboard-batch-${index + 1}.mp4`,
              thumbnailSrc: `https://picsum.photos/seed/storyboard-batch-${index + 1}/320/180`,
              status: "ready",
              durationLabel: "00:10",
            },
          ],
          generationState: {
            ...(storyboard?.generationState ?? {}),
            lastSubmission: {
              id: `batch-video-${index + 1}`,
              mediaKind: "video",
              promptPreview: storyboard?.description ?? "",
              createdAt: now,
              status: "completed",
            },
          },
        }));
      }
      workbench.ui.episodeBatchModal = null;
      workbench.ui.toast = `已为 ${items.length} 条分镜创建视频任务。`;
      collectEpisodeWorkbenchEvent(workbench, "batch.submit", {
        mode,
        scope,
        itemCount: items.length,
        items,
      });
      render(workbench);
      return;
    }

    const imageUrlSeeds = {
      character: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=80",
      scene: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
      prop: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80",
    };
    const nextAssets = cloneImportedAssets(workbench.ui.importedAssets);
    const batchResults = { ...(workbench.ui.episodeBatchResults ?? {}) };

    for (const [index, item] of items.entries()) {
      const assetKind = item.kind || inferEpisodeAssetKind(item.name);
      const imageUrl = resolveApiUrl(item.previewUrl ?? item.preview ?? item.sourceUrl ?? imageUrlSeeds[assetKind] ?? imageUrlSeeds.character);
      const selectionContext = {
        episodeId: workbench.ui.selectedEpisodeId ?? "episode-primary",
        episodeTitle: null,
        assetTab: assetKind,
        selectedAssetId: item.id,
        selectedAssetName: item.name ?? "素材",
        selectedAssetDescription: item.description ?? "",
        selectedAssetPreview: imageUrl,
      };
      const result = {
        mediaKind: "image",
        promptPreview:
          item.description?.trim() ||
          `${resolveEpisodeAssetKindLabel(assetKind)} ${item.name ?? ""} 固定图生成`,
        quickReferenceItems: [],
        attachmentItems: [],
        selectionContext,
        selectedModelId: mode === "video" ? (modal?.videoModelId ?? "vidu-q3-pro") : (modal?.imageModelId ?? "tnb-pro"),
        resolution: mode === "video" ? (modal?.videoResolution ?? "720P") : (modal?.size ?? "2K"),
        aspectRatio: modal?.aspectRatio ?? "16:9",
        durationSec: mode === "video" ? 10 : null,
        creditCost: resolveEpisodeBatchUnitCredit(modal),
        createdAt: now,
        completedAt: now,
        status: "completed",
        taskId: `batch-${mode}-${index + 1}-${Date.now().toString(36)}`,
        fixedImages: [
          {
            id: `${item.id}-batch-image`,
            label: assetKind === "scene" ? "场景图片" : assetKind === "prop" ? "道具图片" : "角色图片",
            url: imageUrl,
            storageObjectId: null,
            assetVersionId: null,
          },
        ],
      };
      batchResults[item.id] = result;
      appendAssetConversationHistoryEntry(workbench, result);
      nextAssets[assetKind] = (nextAssets[assetKind] ?? []).map((asset) =>
        asset.id === item.id
          ? {
              ...asset,
              preview: imageUrl,
              previewUrl: imageUrl,
              sourceUrl: imageUrl,
            }
          : asset,
      );
    }

    workbench.ui.importedAssets = nextAssets;
    workbench.ui.episodeBatchResults = batchResults;
    const firstItem = items[0] ?? null;
    if (firstItem) {
      workbench.ui.projectAssetTab = firstItem.kind || inferEpisodeAssetKind(firstItem.name);
      workbench.ui.selectedEpisodeAssetId = firstItem.id;
      workbench.ui.selectedEpisodeCardId = firstItem.id;
      if ((workbench.ui.museScopeMode ?? "storyboard") === "assets") {
        workbench.ui.imageGenerationResult = batchResults[firstItem.id];
      }
    }
    workbench.ui.episodeBatchModal = null;
    workbench.ui.toast = `已为 ${items.length} 项素材创建各自任务，可逐个切换查看结果。`;
    collectEpisodeWorkbenchEvent(workbench, "batch.submit", {
      mode,
      itemCount: items.length,
      items,
      batchConfig: modal,
    });
    render(workbench);
    return;
  }

  if (action === "remove-quick-reference") {
    const referenceId = target.dataset.referenceId ?? "";
    if ((workbench.ui.museScopeMode ?? "storyboard") === "assets") {
      const assetPromptDraft = workbench.ui.assetPromptDraft ?? {};
      workbench.ui.assetPromptDraft = {
        ...assetPromptDraft,
        quickReferenceItems: (assetPromptDraft.quickReferenceItems ?? []).filter((item) => item.id !== referenceId),
        mentionReferences: (assetPromptDraft.mentionReferences ?? []).filter((item) => item.id !== referenceId),
      };
      render(workbench);
      return;
    }
    const selectedStoryboard = getSelectedStoryboard(
      getActiveStoryboards(workbench),
      workbench.ui.selectedStoryboardId,
    );
    if (!selectedStoryboard) {
      return;
    }
    updateStoryboardGenerationState(workbench, selectedStoryboard.id, (generationState) => ({
      ...generationState,
      quickReferenceItems: (generationState.quickReferenceItems ?? []).filter((item) => item.id !== referenceId),
      mentionReferences: (generationState.mentionReferences ?? []).filter((item) => item.id !== referenceId),
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
    renderEpisodeWorkbenchPromptDockOnly(workbench);
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
    const selectedStoryboard = getSelectedStoryboard(
      getActiveStoryboards(workbench),
      workbench.ui.selectedStoryboardId,
    );
    if (selectedStoryboard) {
      updateStoryboardGenerationState(workbench, selectedStoryboard.id, (state) => ({
        ...state,
        firstFrame: attachmentId === "first-frame" ? null : state.firstFrame,
        lastFrame: attachmentId === "last-frame" ? null : state.lastFrame,
        editSourceVideo: attachmentId === "edit-source-video" ? null : state.editSourceVideo,
        referenceUploads: (state.referenceUploads ?? []).filter((item) => item.id !== attachmentId),
      }));
    }
    workbench.ui.toast = "已移除当前附件。";
    renderEpisodeWorkbenchPromptDockOnly(workbench);
    return;
  }

  if (action === "set-episode-media-mode") {
    stopLipSyncAudioPreview(workbench);
    workbench.ui.episodeMediaMode = target.dataset.mode ?? "image";
    if (workbench.ui.episodeMediaMode === "image") {
      workbench.ui.selectedModelId = resolveConfiguredImageModelCode(
        workbench,
        workbench.ui.imageGenerationMode,
        "gpt-image-2-cn",
      );
      workbench.ui.videoAudioEnabled = false;
      workbench.ui.videoMusicEnabled = false;
      workbench.ui.videoLipSyncEnabled = false;
    } else if (workbench.ui.episodeMediaMode === "video") {
      workbench.ui.selectedModelId =
        workbench.ui.videoGenerationMode === "reference-video"
          ? resolveConfiguredVideoModelCode(workbench, "reference-video", "seedance-2-0-vip")
          : workbench.ui.videoGenerationMode === "first-last-frame"
            ? "hailuo-2-0"
            : workbench.ui.videoGenerationMode === "edit-video"
              ? "happy-horse"
              : resolveConfiguredVideoModelCode(workbench, "first-frame", "seedance-i2v-pro");
    } else if (workbench.ui.episodeMediaMode === "lip-sync") {
      workbench.ui.selectedModelId = "vidu-q3-pro";
    }
    if ((workbench.ui.museScopeMode ?? "storyboard") === "storyboard") {
      await loadSelectedStoryboardConversationHistory(workbench, {
        mediaKind: resolveStoryboardConversationMediaKind(workbench),
      });
    }
    syncPromptFromCurrentScope(workbench);
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
      workbench.ui.selectedModelId = resolveConfiguredVideoModelCode(workbench, "reference-video", "seedance-2-0-vip");
      applySelectedModelGenerationDefaults(workbench, "video");
    } else if (workbench.ui.videoGenerationMode === "first-frame") {
      workbench.ui.selectedModelId = resolveConfiguredVideoModelCode(workbench, "first-frame", "seedance-i2v-pro");
      applySelectedModelGenerationDefaults(workbench, "video");
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
      workbench.ui.selectedModelId = resolveConfiguredImageModelCode(workbench, "multi-image", "gpt-image-2-cn");
      workbench.ui.imageCount = 9;
    } else {
      workbench.ui.selectedModelId = resolveConfiguredImageModelCode(workbench, "single-image", "gpt-image-2-cn");
      workbench.ui.imageCount = 1;
    }
    applySelectedModelGenerationDefaults(workbench, "image");
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
    workbench.ui.toast = "正在打开项目工作台...";
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
      workbench.ui.toast = "已进入项目工作台。";
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
      toast: "已进入剧集工作台。",
    });
    return;
  }

  if (action === "back-to-episode-hub") {
    stopLipSyncAudioPreview(workbench);
    workbench.ui.selectedEpisodeId = null;
    workbench.ui.projectPanelMode = "workspace";
    workbench.ui.projectInteriorSection = "episodes";
    workbench.ui.episodeCardMenuId = null;
    workbench.ui.toast = "已返回剧集列表。";
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
    await openSingleEpisodeFlow(workbench);
    return;
  }

  if (action === "__legacy-open-batch-episode-flow") {
    openBatchEpisodeFlow(workbench);
    return;
    workbench.ui.projectInteriorSection = "episodes";
    workbench.ui.isScriptModalOpen = true;
    workbench.ui.scriptTab = "script-upload";
    workbench.ui.scriptSubmitAction = "confirm-batch-episode";
    workbench.ui.scriptSubmitLabel = "确认上传";
    workbench.ui.uploadNotice = "";
    render(workbench);
    return;
  }

  if (action === "close-single-episode-modal") {
    resetSingleEpisodeModalState(workbench);
    render(workbench);
    return;
  }

  if (action === "close-ai-storyboard-preview") {
    workbench.ui.singleEpisodeAiPreview = { status: "idle", data: null, error: "" };
    render(workbench);
    return;
  }

  if (action === "create-empty-single-episode") {
    const nextName = getNextEpisodeTitle(getDetailEpisodes(workbench.state));
    await createSingleEpisodeAndEnterWorkbench(workbench, nextName);
    return;
  }

  if (action === "commit-ai-storyboard-preview") {
    await commitAiStoryboardPreviewAndEnterWorkbench(workbench);
    return;
  }

  if (action === "set-single-episode-aspect") {
    workbench.ui.singleEpisodeAspectRatio = target.dataset.aspect ?? "9:16";
    render(workbench);
    return;
  }

  if (action === "toggle-single-episode-look-panel") {
    const type = normalizeSingleEpisodeLookType(target.dataset.lookType);
    if (!type) {
      return;
    }
    const nextPanel = workbench.ui.singleEpisodeLookPanel === type ? "" : type;
    workbench.ui.singleEpisodeLookPanel = nextPanel;
    if (nextPanel && !hasStoryboardPromptPackagesForType(workbench, nextPanel)) {
      await syncStoryboardPromptPackages(workbench);
    }
    render(workbench);
    return;
  }

  if (action === "toggle-single-episode-look-package") {
    toggleSingleEpisodeLookPackage(workbench, {
      type: target.dataset.lookType,
      packageId: target.dataset.packageId,
    });
    render(workbench);
    return;
  }

  if (action === "confirm-single-episode") {
    const nextScript = workbench.ui.singleEpisodeScript.trim();
    if (!nextScript) {
      workbench.ui.singleEpisodeNotice = "请先填写单集内容后再创建。";
      render(workbench);
      return;
    }
    const projectId = workbench.ui.selectedProjectCardId ?? workbench.state?.project?.id ?? null;
    const packages = {
      genrePackageId: resolveSingleEpisodeSelectedPromptPackageId(workbench, "genre"),
      emotionPackageId: resolveSingleEpisodeSelectedPromptPackageId(workbench, "emotion"),
    };
    if (!projectId || !packages.genrePackageId || !packages.emotionPackageId) {
      workbench.ui.singleEpisodeNotice = "请先选择题材、情绪看点后再生成。";
      render(workbench);
      return;
    }
    workbench.ui.singleEpisodeName = buildSingleEpisodeTitle(nextScript, getDetailEpisodes(workbench.state));
    workbench.ui.singleEpisodeNotice = "";
    workbench.ui.singleEpisodeAiPreview = {
      status: "loading",
      data: { displayTables: createSingleEpisodeAiLiveDisplayTables() },
      error: "",
      scriptText: "",
      scriptRawText: "",
      promptText: "",
      scriptPromptText: "",
      promptPromptText: "",
      assetPromptSteps: [],
      activeStage: "script",
    };
    render(workbench);
    try {
      const previewInput = {
        scriptText: nextScript,
        packages,
      };
      let preview = null;
      if (typeof workbench.api.createAiStoryboardPreviewStream === "function") {
        for await (const event of workbench.api.createAiStoryboardPreviewStream(projectId, previewInput)) {
          const eventName = event?.event ?? "";
          const data = event?.data ?? {};
          if (eventName === "script_prompt") {
            workbench.ui.singleEpisodeAiPreview.scriptPromptText = String(data.text ?? "");
          } else if (eventName === "script_start") {
            workbench.ui.singleEpisodeAiPreview.activeStage = "script";
          } else if (eventName === "script_delta") {
            workbench.ui.singleEpisodeAiPreview.scriptText = appendBoundedText(
              workbench.ui.singleEpisodeAiPreview.scriptText,
              data.text,
              SINGLE_EPISODE_AI_LIVE_TEXT_LIMIT,
            );
            workbench.ui.singleEpisodeAiPreview.scriptRawText = appendBoundedText(
              workbench.ui.singleEpisodeAiPreview.scriptRawText,
              data.text,
              SINGLE_EPISODE_AI_LIVE_TEXT_LIMIT,
            );
            syncSingleEpisodeAiScriptTable(workbench);
            workbench.ui.singleEpisodeAiPreview.activeStage = "script";
          } else if (eventName === "script_done") {
            workbench.ui.singleEpisodeAiPreview.scriptText = String(data.text ?? workbench.ui.singleEpisodeAiPreview.scriptText ?? "");
            workbench.ui.singleEpisodeAiPreview.scriptRawText = String(data.rawText ?? workbench.ui.singleEpisodeAiPreview.scriptRawText ?? "");
            syncSingleEpisodeAiScriptTable(workbench);
            workbench.ui.singleEpisodeAiPreview.activeStage = "script";
          } else if (eventName === "prompt_prompt") {
            workbench.ui.singleEpisodeAiPreview.promptPromptText = String(data.text ?? "");
          } else if (eventName === "prompt_start") {
            workbench.ui.singleEpisodeAiPreview.activeStage = "prompt";
          } else if (eventName === "prompt_delta") {
            workbench.ui.singleEpisodeAiPreview.promptText = appendBoundedText(
              workbench.ui.singleEpisodeAiPreview.promptText,
              data.text,
              SINGLE_EPISODE_AI_LIVE_TEXT_LIMIT,
            );
            workbench.ui.singleEpisodeAiPreview.activeStage = "prompt";
          } else if (eventName === "asset_prompt") {
            upsertSingleEpisodeAiAssetStep(workbench, data, { promptText: String(data.text ?? "") });
            workbench.ui.singleEpisodeAiPreview.activeStage = data.stage ?? "asset";
          } else if (eventName === "asset_start") {
            upsertSingleEpisodeAiAssetStep(workbench, data, { status: "loading" });
            workbench.ui.singleEpisodeAiPreview.activeStage = data.stage ?? "asset";
          } else if (eventName === "asset_delta") {
            appendSingleEpisodeAiAssetStepText(workbench, data);
            if (String(data.stage ?? "") === "shot") {
              workbench.ui.singleEpisodeAiPreview.promptText = appendBoundedText(
                workbench.ui.singleEpisodeAiPreview.promptText,
                data.text,
                SINGLE_EPISODE_AI_LIVE_TEXT_LIMIT,
              );
            }
            workbench.ui.singleEpisodeAiPreview.activeStage = data.stage ?? "asset";
          } else if (eventName === "asset_done") {
            const rawResponseText = String(data.text ?? "");
            upsertSingleEpisodeAiAssetStep(workbench, data, {
              status: "done",
              responseText: appendBoundedText("", rawResponseText, SINGLE_EPISODE_AI_LIVE_TEXT_LIMIT),
              rawResponseText,
            });
            syncSingleEpisodeAiAssetTable(workbench, data.stage);
          } else if (eventName === "complete") {
            preview = data;
          } else if (eventName === "error") {
            throw new Error(data.error ?? "ai_storyboard_stream_failed");
          }
          renderSingleEpisodeAiPreviewProgress(workbench);
        }
      } else {
        preview = await workbench.api.createAiStoryboardPreview(projectId, previewInput);
      }
      clearSingleEpisodeAiPreviewRenderTimer(workbench);
      workbench.ui.singleEpisodeAiPreview = {
        status: "ready",
        data: preview,
        error: "",
        scriptText: workbench.ui.singleEpisodeAiPreview.scriptText || preview?.scriptText || "",
        scriptRawText: workbench.ui.singleEpisodeAiPreview.scriptRawText || workbench.ui.singleEpisodeAiPreview.scriptText || preview?.scriptText || "",
        promptText: workbench.ui.singleEpisodeAiPreview.promptText ?? "",
        scriptPromptText: workbench.ui.singleEpisodeAiPreview.scriptPromptText ?? "",
        promptPromptText: workbench.ui.singleEpisodeAiPreview.promptPromptText ?? "",
        assetPromptSteps: workbench.ui.singleEpisodeAiPreview.assetPromptSteps ?? [],
        liveDisplayTables: workbench.ui.singleEpisodeAiPreview.data?.displayTables ?? null,
        activeStage: "complete",
      };
    } catch (error) {
      clearSingleEpisodeAiPreviewRenderTimer(workbench);
      workbench.ui.singleEpisodeAiPreview = {
        status: "error",
        data: null,
        error: friendlyError(error),
        scriptText: workbench.ui.singleEpisodeAiPreview.scriptText ?? "",
        scriptRawText: workbench.ui.singleEpisodeAiPreview.scriptRawText ?? "",
        promptText: workbench.ui.singleEpisodeAiPreview.promptText ?? "",
        scriptPromptText: workbench.ui.singleEpisodeAiPreview.scriptPromptText ?? "",
        promptPromptText: workbench.ui.singleEpisodeAiPreview.promptPromptText ?? "",
        assetPromptSteps: workbench.ui.singleEpisodeAiPreview.assetPromptSteps ?? [],
        activeStage: "error",
      };
      workbench.ui.singleEpisodeNotice = `AI 分镜失败：${friendlyError(error)}`;
    }
    render(workbench);
    return;
  }

  if (action === "open-single-episode-flow") {
    await openSingleEpisodeFlow(workbench);
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
    await runAction(workbench, "正在重命名剧集...", async () => {
      await workbench.api.updateEpisode({
        episodeId,
        title: nextName,
      });
      if (workbench.ui.selectedProjectCardId) {
        applyProjectDetail(
          workbench,
          await loadProjectDetailForWorkbench(workbench, workbench.ui.selectedProjectCardId),
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
    await runAction(workbench, "正在删除剧集...", async () => {
      const projectId = resolveActiveProjectId(workbench);
      if (episodeId === "episode-primary") {
        removeLocalPrimaryEpisode(workbench);
      } else if (projectId && typeof workbench.api.deleteProjectEpisode === "function") {
        await workbench.api.deleteProjectEpisode(projectId, episodeId);
      } else {
        await workbench.api.deleteEpisode({ projectId, episodeId });
      }
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
          await loadProjectDetailForWorkbench(workbench, workbench.ui.selectedProjectCardId),
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
    await ensureEpisodeWorkbenchAssetsHydrated(workbench);
    syncSelectedEpisodeAssetForCurrentTab(workbench);
    workbench.ui.episodeWorkbenchScrollTarget = workbench.ui.projectAssetTab;
    workbench.ui.projectInteriorStatusMenuOpen = false;
    workbench.ui.assetCardMenuId = null;
    if (workbench.ui.museScopeMode === "assets") {
      clearAssetPromptDraftForCurrentSelection(workbench);
      await loadSelectedAssetConversationHistory(workbench, { mediaKind: "image" });
      syncPromptFromCurrentScope(workbench);
    }
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
    await runAction(workbench, "正在重命名资产...", async () => {
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
    if (!draft?.assetId) {
      return;
    }
    await runAction(workbench, "正在重命名资产...", async () => {
      await workbench.api.updateProjectAsset(draft.assetId, {
        name: normalizedName,
      });
      syncProjectAssetNameState(workbench, draft.assetKind, draft.assetId, normalizedName);
      workbench.ui.toast = `已重命名为 ${normalizedName}。`;
      workbench.ui.renameImportedAsset = null;
      workbench.ui.renameImportedAssetName = "";
      workbench.ui.renameImportedAssetNotice = "";
    });
    return;
  }

  if (action === "download-imported-asset") {
    const assetId = target.dataset.assetId ?? "";
    const assetKind = target.dataset.assetKind ?? workbench.ui.projectAssetTab ?? "character";
    const mediaType = target.dataset.mediaType ?? workbench.ui.projectOtherAssetMediaType ?? "video";
    const asset = findImportedAsset(workbench.ui.importedAssets, assetKind, mediaType, assetId);
    if (!asset?.preview) {
      workbench.ui.toast = "当前资源暂无可下载文件。";
      workbench.ui.assetCardMenuId = null;
      render(workbench);
      return;
    }
    triggerAssetDownload(asset.preview, asset.name, mediaType === "video" ? "mp4" : "png");
    workbench.ui.assetCardMenuId = null;
    workbench.ui.toast = `已开始下载 ${asset.name}。`;
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
    await runAction(workbench, "正在删除资产...", async () => {
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
    await runAction(workbench, "正在删除资产...", async () => {
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
      workbench.ui.toast = draft.name ? `已删除 ${draft.name}。` : "已删除当前资产。";
    });
    return;
  }

  if (action === "open-asset-import-modal") {
    const nextAssetKind = target.dataset.assetKind ?? workbench.ui.projectAssetTab ?? "character";
    if (isRealEpisodeWorkbench(workbench) && nextAssetKind !== "other") {
      await ensureEpisodeWorkbenchAssetsHydrated(workbench);
    }
    workbench.ui.assetImportModal = nextAssetKind;
    workbench.ui.assetImportModalTab =
      isRealEpisodeWorkbench(workbench) && nextAssetKind !== "other" ? "official" : "local";
    workbench.ui.assetImportCategory = "domestic-modern-city";
    workbench.ui.assetImportDrafts = [];
    workbench.ui.assetImportSelection = [];
    workbench.ui.assetImportPage = 1;
    workbench.ui.assetImportPageSize = 10;
    workbench.ui.assetImportPageSizeMenuOpen = false;
    workbench.ui.assetImportOfficialAssets = resolveAssetImportLibraryRecords(workbench, nextAssetKind);
    render(workbench);
    return;
  }

  if (action === "close-asset-import-modal") {
    workbench.ui.assetImportModal = null;
    workbench.ui.referenceAssetPickerKind = null;
    workbench.ui.assetImportDrafts = [];
    workbench.ui.assetImportSelection = [];
    workbench.ui.assetImportPage = 1;
    workbench.ui.assetImportPageSize = 10;
    workbench.ui.assetImportPageSizeMenuOpen = false;
    render(workbench);
    return;
  }

  if (action === "switch-asset-import-tab") {
    workbench.ui.assetImportModalTab = target.dataset.tab ?? "local";
    workbench.ui.assetImportPageSizeMenuOpen = false;
    workbench.ui.assetImportSelection = [];
    workbench.ui.assetImportPage = 1;
    if (workbench.ui.assetImportModalTab === "official") {
      const assetKind = workbench.ui.assetImportModal ?? workbench.ui.projectAssetTab ?? "character";
      workbench.ui.assetImportOfficialAssets = resolveAssetImportLibraryRecords(workbench, assetKind);
    }
    render(workbench);
    return;
  }

  if (action === "select-asset-import-category") {
    workbench.ui.assetImportCategory = target.dataset.category ?? workbench.ui.assetImportCategory;
    render(workbench);
    return;
  }

  if (action === "set-asset-import-kind") {
    const nextAssetKind = target.dataset.assetKind ?? "character";
    workbench.ui.assetImportModal = nextAssetKind;
    workbench.ui.assetImportSelection = [];
    workbench.ui.assetImportPage = 1;
    workbench.ui.assetImportPageSizeMenuOpen = false;
    workbench.ui.assetImportOfficialAssets = resolveAssetImportLibraryRecords(workbench, nextAssetKind);
    render(workbench);
    return;
  }

  if (action === "toggle-asset-import-page-size-menu") {
    workbench.ui.assetImportPageSizeMenuOpen = !workbench.ui.assetImportPageSizeMenuOpen;
    render(workbench);
    return;
  }

  if (action === "set-asset-import-page-size") {
    const nextPageSize = Number(target.dataset.pageSize ?? "10");
    workbench.ui.assetImportPageSize = [10, 20, 50, 100].includes(nextPageSize) ? nextPageSize : 10;
    workbench.ui.assetImportPage = 1;
    workbench.ui.assetImportPageSizeMenuOpen = false;
    workbench.ui.assetImportSelection = [];
    render(workbench);
    return;
  }

  if (action === "change-asset-import-page") {
    const nextPage = Number(target.dataset.page ?? workbench.ui.assetImportPage ?? 1);
    const assetCount = Array.isArray(workbench.ui.assetImportOfficialAssets)
      ? workbench.ui.assetImportOfficialAssets.length
      : 0;
    const totalPages = Math.max(1, Math.ceil(assetCount / Number(workbench.ui.assetImportPageSize ?? 10)));
    workbench.ui.assetImportPage = Math.min(Math.max(Math.trunc(nextPage) || 1, 1), totalPages);
    workbench.ui.assetImportSelection = [];
    workbench.ui.assetImportPageSizeMenuOpen = false;
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
    const seededImportedAssets = [];

    if (workbench.ui.assetImportModalTab === "official") {
      importRecords.push(...(workbench.ui.assetImportOfficialAssets ?? [])
        .filter((asset) => selectedIds.has(asset.id))
        .map((asset) => ({
          ...asset,
          source: asset.source ?? "official",
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

    if (isRealEpisodeWorkbench(workbench) && assetKind !== "other") {
      const existingAssets =
        assetKind === "character"
          ? workbench.ui.importedAssets?.character ?? []
          : assetKind === "scene"
            ? workbench.ui.importedAssets?.scene ?? []
            : workbench.ui.importedAssets?.prop ?? [];
      const existingNames = new Set(
        existingAssets
          .map((asset) => String(asset?.name ?? asset?.label ?? "").trim())
          .filter(Boolean),
      );
      const hasDuplicateName = importRecords.some((record) =>
        existingNames.has(String(record?.name ?? "").trim()),
      );
      if (hasDuplicateName) {
        workbench.ui.toast = "已存在该资源图片";
        render(workbench);
        return;
      }
    }

    await runAction(workbench, "正在导入资产...", async () => {
      for (const record of importRecords) {
        const importPayload =
          record.source === "official"
            ? await buildOfficialAssetImportPayload(workbench, record, assetKind)
            : {
                name: record.name?.trim() || "未命名资产",
                uploadSessionId: record.uploadSessionId ?? null,
                storageObjectId: record.storageObjectId ?? null,
                storageObjectKey: record.storageObjectKey ?? record.previewDataUrl ?? record.preview ?? "",
                sourceUrl: record.sourceUrl ?? record.previewDataUrl ?? record.preview ?? "",
                mimeType: record.mimeType ?? inferMimeTypeFromDataUrl(record.previewDataUrl ?? record.preview ?? ""),
                width: Number(record.width ?? 240),
                height: Number(record.height ?? 240),
                source: record.source ?? "import",
              };
        let imported;
        try {
          imported =
            isRealEpisodeWorkbench(workbench) &&
            typeof workbench.api.importEpisodeAsset === "function"
              ? await workbench.api.importEpisodeAsset(workbench.ui.selectedEpisodeId, {
                  assetType:
                    importKind === "character"
                      ? "role"
                      : importKind === "scene"
                        ? "scene"
                        : "prop",
                  ...importPayload,
                })
              : await workbench.api.importAsset({
                  kind: importKind,
                  ...importPayload,
                });
        } catch (error) {
          if (
            String(error?.errorCode ?? "") === "ASSET_ALREADY_EXISTS" ||
            String(error?.message ?? "") === "ASSET_ALREADY_EXISTS"
          ) {
            throw new Error("已存在该资源图片");
          }
          throw error;
        }
        if (imported?.asset?.id) {
          importedAssetIds.push(imported.asset.id);
          if (isRealEpisodeWorkbench(workbench) && assetKind !== "other") {
            const seededPreview = resolvePreferredFixedImageUrl(
              record.preview,
              record.previewDataUrl,
              record.sourceUrl,
            );
            seededImportedAssets.push({
              id: imported.asset.id,
              assetId: imported.asset.id,
              name: record.name?.trim() || "未命名资产",
              preview: seededPreview,
              previewUrl: seededPreview,
              fixedImageUrl: seededPreview,
              description: record.description ?? "",
              kind: assetKind,
              source: "episode",
              assetSource: "episode",
            });
          }
        }
      }
      seedImportedEpisodeAssets(workbench, assetKind, seededImportedAssets);
      if (isRealEpisodeWorkbench(workbench) && workbench.ui.selectedEpisodeId) {
        await ensureEpisodeWorkbenchAssetsHydrated(workbench);
      }
      if (!isRealEpisodeWorkbench(workbench) && workbench.ui.selectedProjectCardId) {
        applyProjectDetail(
          workbench,
          await workbench.api.getProjectDetail(workbench.ui.selectedProjectCardId),
        );
      }
      workbench.ui.assetImportModal = null;
      workbench.ui.assetImportDrafts = [];
      workbench.ui.assetImportSelection = [];
    });
    if (isRealEpisodeWorkbench(workbench)) {
      workbench.ui.toast = `已导入 ${importRecords.length} 项${getAssetLibraryKindLabel(assetKind, assetKind === "other" ? importKind : "image")}到当前剧集。`;
    } else {
      prepareAssetLibraryReturn(workbench, {
        assetKind,
        mediaType: assetKind === "other" ? importKind : "image",
        assetIds: importedAssetIds,
        count: importRecords.length,
      });
    }
    render(workbench);
    return;
  }

  if (action === "open-asset-generator-modal") {
    workbench.ui.assetGeneratorModal = target.dataset.assetKind ?? workbench.ui.projectAssetTab ?? "character";
    workbench.ui.assetGeneratorMode = "generate";
    workbench.ui.assetGeneratorEditingAsset = null;
    workbench.ui.assetGeneratorCharacterType = "human";
    workbench.ui.assetGeneratorStyleValue = "废土写实 / 官方";
    workbench.ui.assetGeneratorStyleCategory = "official";
    workbench.ui.assetGeneratorStyleOption = "none";
    workbench.ui.assetGeneratorMaterialCategory = "official";
    workbench.ui.assetGeneratorMaterialOption = "fantasy-doomsday";
    workbench.ui.assetGeneratorImageType = "main";
    workbench.ui.assetGeneratorModel = "Seedream 2.0";
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
      await runAction(workbench, "正在保存资产...", async () => {
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
    await runAction(workbench, "正在生成资产...", async () => {
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
    await runAction(workbench, "正在更新项目状态...", async () => {
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
    const totalProjects = Array.isArray(workbench.ui.projectLibrary) ? workbench.ui.projectLibrary.length : 0;
    const totalPages = Math.max(1, Math.ceil(totalProjects / 12));
    workbench.ui.projectLibraryPage = Math.min(totalPages, Math.max(1, nextPage));
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
    renderEpisodeWorkbenchPromptDockOnly(workbench);
    return;
  }

  if (action === "select-video-model") {
    workbench.ui.selectedModelId = target.dataset.modelId ?? workbench.ui.selectedModelId;
    applySelectedModelGenerationDefaults(workbench, workbench.ui.episodeMediaMode === "video" ? "video" : "image");
    workbench.ui.isVideoModelMenuOpen = false;
    workbench.ui.musePromptMenu = null;
    workbench.ui.toast = `Selected ${target.dataset.modelName ?? workbench.ui.selectedModelId}.`;
    renderEpisodeWorkbenchPromptDockOnly(workbench);
    return;
  }

  if (action === "toggle-generation-select-menu") {
    const field = target.dataset.field ?? "";
    workbench.ui.openGenerationSelectMenu =
      workbench.ui.openGenerationSelectMenu === field ? null : field;
    workbench.ui.isVideoModelMenuOpen = false;
    workbench.ui.musePromptMenu = null;
    workbench.ui.activeGenerationFrameMenu = null;
    renderEpisodeWorkbenchPromptDockOnly(workbench);
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
    renderEpisodeWorkbenchPromptDockOnly(workbench);
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
        name: asset.name ?? "未命名资产",
        preview: asset.preview ?? asset.previewUrl ?? "",
        badge: asset.name ?? "未命名",
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
      await runAction(workbench, "正在移除分镜引用...", async () => {
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
        summary: frameTarget === "firstFrame" ? "已引用分镜首帧" : "已引用分镜尾帧",
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
      await runAction(workbench, "正在保存分镜引用...", async () => {
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
      workbench.ui.toast = "未找到要删除的视频。";
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
    await runAction(workbench, "正在重命名项目...", async () => {
      await workbench.api.updateProject({
        projectId,
        name: nextName,
      });
      await refreshProjectLibraryIfAvailable(workbench);
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
    await runAction(workbench, "正在删除项目...", async () => {
      await workbench.api.deleteProject({ projectId });
      await refreshProjectLibraryIfAvailable(workbench);
      workbench.ui.deleteProjectId = null;
      if (workbench.ui.selectedProjectCardId === projectId) {
        workbench.ui.selectedProjectCardId = null;
        workbench.ui.projectPanelMode = "library";
      }
    });
    return;
  }

  if (action === "add-storyboard") {
    const anchorStoryboardId = target.dataset.storyboardId ?? null;
    const episodeId =
      workbench.ui.projectPanelMode === "episode-workbench"
        ? workbench.ui.selectedEpisodeId ?? "episode-primary"
        : "episode-primary";
    if (workbench.state?.project?.id) {
      await runAction(workbench, "正在创建分镜...", async () => {
        const existing = getEpisodeStoryboards(workbench, episodeId);
        const nextIndex = existing.length + 1;
        const result = await workbench.api.createShot({
          episodeId: episodeId === "episode-primary" ? null : episodeId,
          title: String(nextIndex),
          description: "",
        });
        appendCreatedShotToState(workbench, result.shot);
        if (episodeId !== "episode-primary" && typeof workbench.api.listStoryboards === "function") {
          const refreshedStoryboards = await loadEpisodeStoryboardsForWorkbench(workbench, episodeId);
          workbench.ui.selectedStoryboardId =
            refreshedStoryboards.find((item) => item.linkedShotId === result.shot?.id)?.id ??
            resolveInsertedStoryboardId(refreshedStoryboards, anchorStoryboardId) ??
            refreshedStoryboards.at(-1)?.id ??
            null;
          persistWorkbenchState(workbench);
          return;
        }
        const nextStoryboards = anchorStoryboardId
          ? insertStoryboardAfter(existing, anchorStoryboardId)
          : addStoryboard(existing);
        const addedStoryboard = result.shot?.id
          ? nextStoryboards.find((item) => item.linkedShotId === result.shot.id) ?? nextStoryboards.find((item) => !item.linkedShotId)
          : nextStoryboards.find((item) => !item.linkedShotId);
        if (addedStoryboard) {
          const now = new Date();
          const displayTitle = [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, "0"),
            String(now.getDate()).padStart(2, "0"),
          ].join("-") + ` ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
          const nextStoryboard = {
            ...addedStoryboard,
            id: result.shot?.id ? `storyboard-${result.shot.id}` : addedStoryboard.id,
            linkedShotId: result.shot?.id ?? addedStoryboard.linkedShotId ?? null,
            displayTitle,
          };
          replaceActiveStoryboards(
            workbench,
            nextStoryboards.map((item) => (item === addedStoryboard ? nextStoryboard : item)),
          );
          workbench.ui.selectedStoryboardId = nextStoryboard.id;
          persistWorkbenchState(workbench);
        }
      }, { successToast: "" });
      return;
    }
    const nextStoryboards = anchorStoryboardId
      ? insertStoryboardAfter(getEpisodeStoryboards(workbench, episodeId), anchorStoryboardId)
      : addStoryboard(getEpisodeStoryboards(workbench, episodeId));
    workbench.ui.storyboards =
      episodeId === "episode-primary" ? nextStoryboards : workbench.ui.storyboards;
    workbench.ui.episodeStoryboardMap = {
      ...workbench.ui.episodeStoryboardMap,
      [episodeId]: nextStoryboards,
    };
    workbench.ui.selectedStoryboardId =
      resolveInsertedStoryboardId(nextStoryboards, anchorStoryboardId) ?? nextStoryboards.at(-1)?.id ?? null;
    workbench.ui.toast = "";
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
      isSkip ? "正在跳过校准..." : "正在保存校准设置...",
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

  if (action === "preview-export") {
    workbench.ui.exportOptionModal = {
      show: true,
      status: "idle",
    };
    collectEpisodeWorkbenchEvent(workbench, "export.preview", {
      projectId: workbench.state?.project?.id ?? workbench.ui.selectedProjectCardId ?? null,
      episodeId: workbench.ui.selectedEpisodeId ?? null,
      storyboardCount: getActiveStoryboards(workbench).length,
    });
    render(workbench);
    return;
  }

  if (action === "close-episode-export-modal") {
    workbench.ui.exportOptionModal = null;
    render(workbench);
    return;
  }

  if (action === "start-episode-export") {
    const exportKind = target.dataset.exportKind ?? "mp4";
    const runningMessage = exportKind === "mp4" ? "正在导出视频..." : "正在导出剪映工程...";
    workbench.ui.exportOptionModal = {
      ...(workbench.ui.exportOptionModal ?? { show: true }),
      show: true,
      status: "running",
      kind: exportKind,
      message: runningMessage,
      downloadUrl: "",
    };
    workbench.ui.busy = true;
    workbench.ui.toast = runningMessage;
    render(workbench);
    try {
      workbench.ui.exportPreviewResult = await createEpisodeExportPreviewWithKind(workbench, exportKind);
      const downloadUrl = resolveExportPreviewDownloadUrl(workbench.ui.exportPreviewResult);
      const workflowId =
        workbench.ui.exportPreviewResult?.exportRecord?.workflowId ??
        workbench.ui.exportPreviewResult?.export?.workflowId ??
        "";
      const downloadFileName =
        exportKind === "jianying"
          ? normalizeDownloadName("episode-export", ".zip")
          : normalizeDownloadName("episode-export", ".mp4");
      workbench.ui.exportOptionModal = {
        ...(workbench.ui.exportOptionModal ?? { show: true }),
        show: true,
        status: "done",
        kind: exportKind,
        workflowId,
        downloadUrl,
        message: downloadUrl ? "导出包已准备好，可以直接下载。" : "原视频导出链接暂未生成，请稍后刷新重试。",
      };
      if (downloadUrl) {
        triggerBrowserDownload(downloadUrl, downloadFileName);
      }
      workbench.ui.toast = "操作已完成。";
    } catch (error) {
      workbench.ui.exportOptionModal = {
        ...(workbench.ui.exportOptionModal ?? { show: true }),
        show: true,
        status: "error",
        kind: exportKind,
        errorCode: String(error?.code ?? error?.errorCode ?? ""),
        message: resolveEpisodeExportModalError(error),
        downloadUrl: "",
      };
      workbench.ui.toast = `操作失败：${friendlyError(error)}`;
    } finally {
      workbench.ui.busy = false;
    }
    render(workbench);
    return;
  }

  if (action === "generate-images") {
    syncPromptInputFromDom(workbench);
    if ((workbench.ui.museScopeMode ?? "storyboard") === "assets") {
      const selectionContext = resolveEpisodeAssetSelectionContext(workbench);
      if (!selectionContext.selectedAsset?.id) {
        workbench.ui.validationMessage = "请先创建或选中资产后再生成。";
        workbench.ui.toast = "请先创建或选中资产后再生成。";
        render(workbench);
        return;
      }
      if (!String(getCurrentScopePrompt(workbench) ?? "").trim()) {
        workbench.ui.validationMessage = "请输入内容";
        workbench.ui.toast = "请输入内容";
        render(workbench);
        return;
      }
      await runAction(workbench, statusForAction(action), async () => {
        await generateAssetImages(workbench);
      });
      return;
    }

    if (!String(getCurrentScopePrompt(workbench) ?? "").trim()) {
      workbench.ui.validationMessage = "请输入内容";
      workbench.ui.toast = "请输入内容";
      render(workbench);
      return;
    }

    workbench.ui.validationMessage = "";
    workbench.ui.toast = "";
    render(workbench);
    try {
      await generateStoryboardImages(workbench);
      scrollEpisodeWorkbenchConversationToBottom(workbench);
    } catch (error) {
      workbench.ui.toast = `操作失败：${friendlyError(error)}`;
      render(workbench);
    }
    return;
  }

  if (action === "generate-videos") {
    syncPromptInputFromDom(workbench);
    if (workbench.ui.episodeMediaMode === "lip-sync") {
      const lipSyncValidation = validateLipSyncGeneration(workbench);
      if (!lipSyncValidation.ok) {
        workbench.ui.validationMessage = lipSyncValidation.message;
        workbench.ui.toast = lipSyncValidation.message;
        render(workbench);
        return;
      }
      await persistLipSyncStoryboardDraft(workbench, { silent: false });
    } else {
      const validation = validateVideoGeneration({
        firstFrameUploaded: hasFirstFrame(workbench),
      });
      if (!validation.ok) {
        workbench.ui.validationMessage = validation.message;
        workbench.ui.toast = validation.message;
        render(workbench);
        return;
      }
    }

    workbench.ui.validationMessage = "";
    workbench.ui.toast = "";
    render(workbench);
    try {
      await generateStoryboardVideos(workbench);
      scrollEpisodeWorkbenchConversationToBottom(workbench);
    } catch (error) {
      workbench.ui.toast = `操作失败：${friendlyError(error)}`;
      render(workbench);
    }
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
    workbench.ui.toast = "";
    render(workbench);
    try {
      await runSmartGenerate(workbench);
    } catch (error) {
      workbench.ui.toast = `操作失败：${friendlyError(error)}`;
      render(workbench);
    }
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
    const nextLabel = window.prompt("请输入新的素材名称", target.dataset.label ?? "");
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

  });
}

const handleAction = handleProductionWorkbenchAction;

async function refreshGenerationQueues(workbench) {
  if (typeof workbench.api?.getGenerationQueueHealth !== "function") {
    throw new Error("generation_queue_health_api_missing");
  }
  workbench.ui.generationQueueHealth = await workbench.api.getGenerationQueueHealth();
}

function resolveGenerationQueueJobOperation(target) {
  const queueName = String(target.dataset.queueName ?? "").trim();
  const jobId = String(target.dataset.jobId ?? "").trim();
  const jobAction = String(target.dataset.jobAction ?? "").trim();
  return { queueName, jobId, jobAction };
}

function resolveGenerationStagedRetryOperation(target) {
  const taskId = String(target.dataset.taskId ?? "").trim();
  const stagedAction = String(target.dataset.stagedAction ?? "").trim();
  return { taskId, stagedAction };
}

async function operateGenerationQueueJob(workbench, operation) {
  if (typeof workbench.api?.operateGenerationQueueJob !== "function") {
    throw new Error("generation_queue_job_ops_api_missing");
  }
  const queueName = String(operation?.queueName ?? "").trim();
  const jobId = String(operation?.jobId ?? "").trim();
  const jobAction = String(operation?.jobAction ?? "").trim();
  if (!queueName || !jobId || !jobAction) {
    throw new Error("generation_queue_job_target_missing");
  }

  await workbench.api.operateGenerationQueueJob({
    queueName,
    jobId,
    action: jobAction,
    reason: `从工具箱执行 BullMQ job ${jobAction}`,
  });
  await refreshGenerationQueues(workbench);
}

async function operateGenerationStagedRetry(workbench, operation) {
  const taskId = String(operation?.taskId ?? "").trim();
  const stagedAction = String(operation?.stagedAction ?? "").trim();
  if (!taskId || !stagedAction) {
    throw new Error("generation_staged_retry_target_missing");
  }
  if (stagedAction === "retry_persist_asset") {
    if (typeof workbench.api?.retryGenerationPersistAsset !== "function") {
      throw new Error("generation_retry_persist_asset_api_missing");
    }
    await workbench.api.retryGenerationPersistAsset({
      taskId,
      reason: "从工具箱补写已上传产物的资产记录",
    });
    await refreshGenerationQueues(workbench);
    return;
  }
  if (typeof workbench.api?.retryGenerationFinalize !== "function") {
    throw new Error("generation_retry_finalize_api_missing");
  }
  await workbench.api.retryGenerationFinalize({
    taskId,
    reason: "从工具箱重试产物下载/上传/落库阶段",
  });
  await refreshGenerationQueues(workbench);
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

async function ensureGenerationReady(workbench, options = {}) {
  const mediaKind = options.mediaKind ?? null;
  const canUseRealEpisodeTask = canUseRealEpisodeGenerationTask(workbench, mediaKind);
  if (!workbench.state?.project) {
    throw new Error("creator_project_missing");
  }
  if (!workbench.state.shots.length && !canUseRealEpisodeTask) {
    throw new Error("creator_shots_missing");
  }
  if (!canProceedWithStoryboardGeneration(workbench)) {
    throw new Error("asset_review_not_ready");
  }
  if (!workbench.state.calibration && !canUseRealEpisodeTask) {
    workbench.ui.lastCalibrationResult = await workbench.api.runCalibration();
    await refresh(workbench);
  }
}

function canUseRealEpisodeGenerationTask(workbench, mediaKind) {
  if (!isRealEpisodeWorkbench(workbench)) {
    return false;
  }
  const selectedStoryboard = getSelectedStoryboard(
    getActiveStoryboards(workbench),
    workbench.ui.selectedStoryboardId,
  );
  if (!workbench.ui.selectedEpisodeId || !selectedStoryboard) {
    return false;
  }
  if (mediaKind === "image") {
    return typeof workbench.api?.createImageTask === "function";
  }
  if (mediaKind === "video") {
    return typeof workbench.api?.createVideoTask === "function";
  }
  return false;
}

function canProceedWithStoryboardGeneration(workbench) {
  if (workbench.state?.assetReview?.readyForGeneration) {
    return true;
  }
  const selectedStoryboard = getSelectedStoryboard(
    getActiveStoryboards(workbench),
    workbench.ui.selectedStoryboardId,
  );
  if (!selectedStoryboard) {
    return false;
  }
  const generationState = selectedStoryboard.generationState ?? createEmptyGenerationState();
  const hasStoryboardReferences = Array.isArray(selectedStoryboard.references) && selectedStoryboard.references.length > 0;
  const hasQuickReferenceImages = (generationState.quickReferenceItems ?? []).some(
    (item) => String(item?.kind ?? "") === "image" && item?.url,
  );
  const hasFrameLikeImage = Boolean(generationState.firstFrame?.url || generationState.imageReference?.url);
  return hasStoryboardReferences || hasQuickReferenceImages || hasFrameLikeImage;
}

async function runAction(workbench, message, action, options = {}) {
  const successToast = Object.prototype.hasOwnProperty.call(options, "successToast")
    ? options.successToast
    : "操作已完成。";
  workbench.ui.busy = true;
  workbench.ui.toast = message;
  render(workbench);

  try {
    await action();
    workbench.ui.toast = successToast;
  } catch (error) {
    workbench.ui.toast = `操作失败：${friendlyError(error)}`;
  } finally {
    workbench.ui.busy = false;
    render(workbench);
  }
}

export async function handleWorkbenchActionForTest(workbench, target) {
  return handleAction(workbench, target);
}

export function mapEpisodeStoryboardContractForTest(storyboard) {
  return mapEpisodeStoryboardContract(storyboard);
}

async function openSingleEpisodeFlow(workbench) {
  workbench.ui.projectInteriorSection = "episodes";
  workbench.ui.isSingleEpisodeModalOpen = true;
  workbench.ui.isScriptModalOpen = false;
  workbench.ui.singleEpisodeName = "";
  workbench.ui.singleEpisodeScript = "";
  workbench.ui.singleEpisodeAspectRatio = "9:16";
  workbench.ui.singleEpisodeModel = "seedance-2.0";
  workbench.ui.singleEpisodeNotice = "";
  workbench.ui.singleEpisodeLookPanel = "";
  workbench.ui.singleEpisodeAiPreview = { status: "idle", data: null, error: "" };
  workbench.ui.selectedSingleEpisodeLookPackageIds = createEmptySingleEpisodeLookSelection();
  workbench.ui.uploadNotice = "";
  await syncStoryboardPromptPackages(workbench);
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
      toast: "已进入剧集工作台。",
      shouldRender: false,
    });
  };

  if (options.skipRunAction) {
    await runCreation();
    return;
  }

  await runAction(workbench, "正在创建剧集...", runCreation);
}

async function commitAiStoryboardPreviewAndEnterWorkbench(workbench) {
  const previewState = workbench.ui.singleEpisodeAiPreview ?? {};
  const previewData = previewState.data?.commitPayload ? previewState.data : previewState.data?.data ?? previewState.data;
  const commitPayload = bindSingleEpisodeAiPreviewStoryboardPrompts(previewData?.commitPayload ?? null, previewData);
  const projectId = workbench.ui.selectedProjectCardId ?? workbench.state?.project?.id ?? null;
  if (!projectId) {
    workbench.ui.singleEpisodeNotice = "请先选择项目后再创建章节。";
    render(workbench);
    return;
  }
  if (!commitPayload || !Array.isArray(commitPayload.storyboards) || commitPayload.storyboards.length === 0) {
    workbench.ui.singleEpisodeNotice = "AI 分镜结果缺少可创建的分镜，请重新生成。";
    render(workbench);
    return;
  }
  if (typeof workbench.api.commitAiStoryboardPreview !== "function") {
    workbench.ui.singleEpisodeNotice = "当前接口不支持创建 AI 章节，请刷新后重试。";
    render(workbench);
    return;
  }

  await runAction(workbench, "正在创建章节...", async () => {
    const result = await workbench.api.commitAiStoryboardPreview(projectId, {
      episodeTitle: workbench.ui.singleEpisodeName || buildSingleEpisodeTitle(
        workbench.ui.singleEpisodeScript || commitPayload.scriptText || previewData?.scriptText || "",
        getDetailEpisodes(workbench.state),
      ),
      commitPayload,
    });
    if (workbench.ui.selectedProjectCardId) {
      applyProjectDetail(
        workbench,
        await loadProjectDetailForWorkbench(workbench, workbench.ui.selectedProjectCardId),
      );
    }
    const createdEpisodeId =
      result?.episode?.id ??
      result?.episode?.episodeId ??
      result?.body?.episode?.id ??
      result?.body?.episode?.episodeId ??
      null;
    resetSingleEpisodeModalState(workbench);
    workbench.ui.episodeCardMenuId = null;
    await enterEpisodeWorkbench(workbench, createdEpisodeId ?? getDefaultEpisodeWorkbenchId(workbench), {
      toast: "已创建章节并进入分镜工作台。",
      shouldRender: false,
      scopeMode: "storyboard",
    });
  }, {
    successToast: "已创建章节并进入分镜工作台。",
  });
}

function bindSingleEpisodeAiPreviewStoryboardPrompts(commitPayload, previewData) {
  if (!commitPayload || typeof commitPayload !== "object" || !Array.isArray(commitPayload.storyboards)) {
    return commitPayload;
  }
  const storyboardRows = resolveSingleEpisodeAiPreviewStoryboardRows(previewData);
  if (!storyboardRows.length) {
    return commitPayload;
  }
  const sourceStoryboards =
    storyboardRows.length > 0 && storyboardRows.length !== commitPayload.storyboards.length
      ? storyboardRows
      : commitPayload.storyboards;
  return {
    ...commitPayload,
    storyboards: sourceStoryboards.map((sourceStoryboard, index) => {
      const storyboard =
        sourceStoryboard === storyboardRows[index]
          ? commitPayload.storyboards[index] && typeof commitPayload.storyboards[index] === "object"
            ? { ...commitPayload.storyboards[index], ...sourceStoryboard }
            : sourceStoryboard
          : sourceStoryboard;
      if (!storyboard || typeof storyboard !== "object") {
        return storyboard;
      }
      const row = storyboardRows[index];
      if (!row || typeof row !== "object") {
        return storyboard;
      }
      const videoPrompt = firstSingleEpisodeAiPreviewRowText(row, [
        "chapterVideoPrompt",
        "chapter_video_prompt",
        "videoPrompt",
        "video_prompt",
        "motionPrompt",
        "motion_prompt",
        "动态视频提示词",
        "视频提示词",
      ]);
      const imagePrompt = firstSingleEpisodeAiPreviewRowText(row, [
        "chapterImagePrompt",
        "chapter_image_prompt",
        "imagePrompt",
        "image_prompt",
        "staticImagePrompt",
        "static_image_prompt",
        "静态图片提示词",
      ]);
      if (!videoPrompt && !imagePrompt) {
        return storyboard;
      }
      return {
        ...storyboard,
        ...(imagePrompt ? { imagePrompt, chapterImagePrompt: imagePrompt } : {}),
        ...(videoPrompt ? { videoPrompt, chapterVideoPrompt: videoPrompt, description: videoPrompt } : {}),
      };
    }),
  };
}

function resolveSingleEpisodeAiPreviewStoryboardRows(previewData) {
  const candidates = [
    previewData?.displayTables?.storyboards?.rows,
    previewData?.data?.displayTables?.storyboards?.rows,
    previewData?.preview?.displayTables?.storyboards?.rows,
  ];
  return candidates.find((rows) => Array.isArray(rows)) ?? [];
}

function firstSingleEpisodeAiPreviewRowText(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    const text = Array.isArray(value)
      ? value.map((item) => String(item ?? "").trim()).filter(Boolean).join("\n")
      : String(value ?? "").trim();
    if (text) {
      return text;
    }
  }
  return "";
}

function resetSingleEpisodeModalState(workbench) {
  workbench.ui.isSingleEpisodeModalOpen = false;
  workbench.ui.singleEpisodeName = "";
  workbench.ui.singleEpisodeScript = "";
  workbench.ui.singleEpisodeAspectRatio = "9:16";
  workbench.ui.singleEpisodeModel = "seedance-2.0";
  workbench.ui.singleEpisodeNotice = "";
  workbench.ui.singleEpisodeLookPanel = "";
  workbench.ui.singleEpisodeAiPreview = { status: "idle", data: null, error: "" };
  workbench.ui.selectedSingleEpisodeLookPackageIds = createEmptySingleEpisodeLookSelection();
}

function upsertSingleEpisodeAiAssetStep(workbench, data = {}, patch = {}) {
  const stage = String(data.stage ?? "");
  if (!stage) {
    return;
  }
  const current = Array.isArray(workbench.ui.singleEpisodeAiPreview?.assetPromptSteps)
    ? [...workbench.ui.singleEpisodeAiPreview.assetPromptSteps]
    : [];
  const index = current.findIndex((item) => item.stage === stage);
  const next = {
    stage,
    title: String(data.title ?? patch.title ?? stage),
    promptText: "",
    responseText: "",
    status: "idle",
    ...(index >= 0 ? current[index] : {}),
    ...patch,
  };
  if (index >= 0) {
    current[index] = next;
  } else {
    current.push(next);
  }
  workbench.ui.singleEpisodeAiPreview.assetPromptSteps = current;
}

function appendSingleEpisodeAiAssetStepText(workbench, data = {}) {
  const stage = String(data.stage ?? "");
  const text = String(data.text ?? "");
  if (!stage || !text) {
    return;
  }
  const current = Array.isArray(workbench.ui.singleEpisodeAiPreview?.assetPromptSteps)
    ? workbench.ui.singleEpisodeAiPreview.assetPromptSteps
    : [];
  const existing = current.find((item) => item.stage === stage);
  upsertSingleEpisodeAiAssetStep(workbench, data, {
    status: "loading",
    responseText: appendBoundedText(existing?.responseText, text, SINGLE_EPISODE_AI_LIVE_TEXT_LIMIT),
  });
}

function appendBoundedText(current, next, maxChars) {
  const combined = `${String(current ?? "")}${String(next ?? "")}`;
  if (!maxChars || combined.length <= maxChars) {
    return combined;
  }
  return combined.slice(-maxChars);
}

function createSingleEpisodeAiLiveDisplayTables() {
  return {
    script: {
      title: "剧本",
      columns: ["剧本文字"],
      rows: [],
    },
    scenes: {
      title: "场景",
      columns: ["场景名称", "场景描述", "场景图片提示词"],
      rows: [],
    },
    characters: {
      title: "角色",
      columns: ["角色名称", "角色描述", "角色图片提示词"],
      rows: [],
    },
    props: {
      title: "道具",
      columns: ["道具名称", "道具描述", "道具图片提示词"],
      rows: [],
    },
    storyboards: {
      title: "分镜",
      columns: ["镜号", "分镜剧情", "对话/旁白", "时长", "时间段", "转场", "景别/运镜", "静态图片提示词", "动态视频提示词", "分镜详细字段"],
      rows: [],
    },
  };
}

function ensureSingleEpisodeAiLiveDisplayTables(workbench) {
  const preview = workbench.ui.singleEpisodeAiPreview;
  if (!preview.data || typeof preview.data !== "object") {
    preview.data = { displayTables: createSingleEpisodeAiLiveDisplayTables() };
  }
  if (!preview.data.displayTables) {
    preview.data.displayTables = createSingleEpisodeAiLiveDisplayTables();
  }
  return preview.data.displayTables;
}

function syncSingleEpisodeAiScriptTable(workbench) {
  const scriptText = String(workbench.ui.singleEpisodeAiPreview?.scriptText ?? "");
  const tables = ensureSingleEpisodeAiLiveDisplayTables(workbench);
  tables.script = {
    ...(tables.script ?? {}),
    title: "剧本",
    columns: ["剧本文字"],
    rows: scriptText.trim()
      ? [{ beatNo: 1, scriptContent: scriptText, dialogue: "" }]
      : [],
  };
}

function syncSingleEpisodeAiAssetTable(workbench, stage) {
  const normalizedStage = String(stage ?? "");
  const tableKeyByStage = {
    scene: "scenes",
    character: "characters",
    prop: "props",
    shot: "storyboards",
  };
  const tableKey = tableKeyByStage[normalizedStage];
  if (!tableKey) {
    return;
  }
  const step = (workbench.ui.singleEpisodeAiPreview?.assetPromptSteps ?? [])
    .find((item) => item.stage === normalizedStage);
  const raw = String(step?.rawResponseText ?? step?.responseText ?? "");
  const rows = parseSingleEpisodeAiStageRows(raw, tableKey);
  if (!rows) {
    return;
  }
  const tables = ensureSingleEpisodeAiLiveDisplayTables(workbench);
  tables[tableKey] = {
    ...(tables[tableKey] ?? {}),
    title: AI_LIVE_TABLE_TITLES[tableKey],
    rows,
  };
}

function parseSingleEpisodeAiStageRows(raw, tableKey) {
  const parsed = parseSingleEpisodeAiJsonObject(raw);
  if (!parsed) {
    return null;
  }
  const keyAliases = {
    scenes: ["scenes", "data"],
    characters: ["characters", "data"],
    props: ["props", "data"],
    storyboards: ["storyboards", "shots", "data"],
  };
  const source = (keyAliases[tableKey] ?? [tableKey])
    .map((key) => parsed[key])
    .find(Array.isArray);
  const records = Array.isArray(source)
    ? source
    : parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? [parsed]
      : [];
  return records
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .map((record) => normalizeSingleEpisodeAiTableRecord(record, tableKey));
}

function parseSingleEpisodeAiJsonObject(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    return null;
  }
  try {
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    const parsed = JSON.parse(fenced?.[1] ?? trimmed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeSingleEpisodeAiTableRecord(record, tableKey) {
  const first = (...keys) => {
    for (const key of keys) {
      const value = record[key];
      if (value !== undefined && value !== null && String(value).trim()) {
        return String(value);
      }
    }
    return "";
  };
  if (tableKey === "scenes") {
    return {
      sceneName: first("sceneName", "scene_name", "name", "locationName", "location_name", "scene"),
      sceneDescription: buildSingleEpisodeAiAssetDescription(record, [
        "sceneDescription",
        "scene_description",
        "description",
        "summary",
        "environment",
        "weather",
        "天气",
        "time",
        "timeOfDay",
        "时间",
        "空间结构",
        "spaceStructure",
        "architecturalStyle",
        "buildingStyle",
        "建筑风格",
        "buildingDetails",
        "建筑细节",
        "lighting",
        "lightingRules",
        "光影规则",
        "atmosphere",
        "氛围基调",
        "keyProps",
        "关键道具",
        "sceneImagePrompt",
        "scene_image_prompt",
        "imagePrompt",
        "image_prompt",
        "prompt",
      ]),
      sceneImagePrompt: first("sceneImagePrompt", "scene_image_prompt", "imagePrompt", "image_prompt", "prompt"),
    };
  }
  if (tableKey === "characters") {
    return {
      characterName: first("characterName", "character_name", "name", "role", "character"),
      characterDescription: buildSingleEpisodeAiAssetDescription(record, [
        "characterDescription",
        "character_description",
        "description",
        "appearance",
        "summary",
        "age",
        "年龄",
        "nationality",
        "国籍",
        "gender",
        "性别",
        "costume",
        "clothing",
        "服装",
        "face",
        "facialFeatures",
        "脸部特征",
        "detailFeatures",
        "细节特征",
        "bodyFeatures",
        "personality",
        "characterImagePrompt",
        "character_image_prompt",
        "imagePrompt",
        "image_prompt",
        "prompt",
      ]),
      characterImagePrompt: first("characterImagePrompt", "character_image_prompt", "imagePrompt", "image_prompt", "prompt"),
    };
  }
  if (tableKey === "props") {
    return {
      propName: first("propName", "prop_name", "name", "prop"),
      propDescription: buildSingleEpisodeAiAssetDescription(record, [
        "propDescription",
        "prop_description",
        "description",
        "summary",
        "usage",
        "用途",
        "appearance",
        "外观",
        "color",
        "颜色",
        "material",
        "材质",
        "size",
        "尺寸",
        "state",
        "状态",
        "ownerOrUser",
        "所属角色",
        "firstAppearance",
        "首次出现",
        "consistency",
        "一致性约束",
        "propImagePrompt",
        "prop_image_prompt",
        "imagePrompt",
        "image_prompt",
        "prompt",
      ]),
      propImagePrompt: first("propImagePrompt", "prop_image_prompt", "imagePrompt", "image_prompt", "prompt"),
    };
  }
  const timeRange = normalizeSingleEpisodeAiPerShotTimeRange(
    first("timeRange", "time_range", "time", "timestamp", "timeline", "时间", "时间范围"),
    first("durationSec", "duration_sec", "duration", "durationSeconds", "duration_seconds", "时长"),
  );
  const transition = first("transition", "cut", "sceneTransition", "scene_transition", "转场");
  const shotSize = first("shotSize", "shot_size", "shot", "frameSize", "frame_size", "cameraShot", "camera_shot", "景别", "镜头");
  const cameraMovement = first("cameraMovement", "camera_movement", "cameraMove", "camera_move", "movement", "motion", "lensMovement", "lens_movement", "cameraPrompt", "camera_prompt", "运镜", "镜头运动");
  const visualDescription = first("visualDescription", "visual_description", "pictureDescription", "picture_description", "frameDescription", "frame_description", "画面描述", "画面");
  const coreAction = first("coreAction", "core_action", "keyAction", "key_action", "核心动作");
  const interactionDesign = first("interactionDesign", "interaction_design", "opponentDesign", "opponent_design", "counterpartDesign", "counterpart_design", "对手戏设计", "对手设计");
  const characterLogic = first("characterLogic", "character_logic", "performanceLogic", "performance_logic", "motivation", "人物底层逻辑", "人物表演底层逻辑");
  const subjectAction = first("subjectAction", "subject_action", "mainAction", "main_action", "主体动作");
  const soundEffect = first("soundEffect", "sound_effect", "sfx", "sound", "audio", "音效", "声音");
  const bgm = first("bgm", "music", "backgroundMusic", "background_music", "配乐", "背景音乐");
  return {
    shotNo: first("shotNo", "shot_no", "index", "no", "镜号"),
    plot: first("plot", "action", "story", "summary", "description", "scene", "画面", "动作"),
    dialogue: first("dialogue", "dialog", "lines", "voiceover", "voice_over", "narration", "台词", "旁白"),
    durationSec: first("durationSec", "duration_sec", "duration", "durationSeconds", "duration_seconds", "时长"),
    timeRange,
    transition,
    shotDirection: [shotSize, cameraMovement].filter(Boolean).join("/"),
    imagePrompt: first("imagePrompt", "image_prompt", "prompt", "visualPrompt", "visual_prompt", "visual_focus"),
    videoPrompt: buildSingleEpisodeAiLiveVideoPrompt({
      baseVideoPrompt: sanitizeSingleEpisodeAiPerShotVideoPrompt(first("videoPrompt", "video_prompt", "video_prompt_text", "motionPrompt", "motion_prompt", "视频提示词", "动态视频提示词")),
      timeRange,
      transition,
      shotSize,
      cameraMovement,
      visualDescription,
      coreAction,
      interactionDesign,
      characterLogic,
      subjectAction,
      soundEffect,
      bgm,
    }),
    shotDetails: buildSingleEpisodeAiStoryboardDetails({
      visualDescription,
      coreAction,
      interactionDesign,
      characterLogic,
      subjectAction,
      soundEffect,
      bgm,
      scene: first("sceneName", "scene_name", "sceneId", "scene_id", "scene"),
      characters: first("characterNames", "character_names", "characterIds", "character_ids", "characters"),
      props: first("props", "propNames", "prop_names", "propIds", "prop_ids"),
    }),
  };
}

function buildSingleEpisodeAiStoryboardDetails(parts = {}) {
  return [
    ["画面描述", parts.visualDescription],
    ["核心动作", parts.coreAction],
    ["对手戏设计", parts.interactionDesign],
    ["人物底层逻辑", parts.characterLogic],
    ["主体动作", parts.subjectAction],
    ["音效", parts.soundEffect],
    ["配乐", parts.bgm],
    ["场景", parts.scene],
    ["角色", parts.characters],
    ["道具", parts.props],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}

function buildSingleEpisodeAiAssetDescription(record, keys) {
  const lines = [];
  const seen = new Set();
  for (const key of keys) {
    const value = record?.[key];
    const text = value === undefined || value === null ? "" : String(value).trim();
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    lines.push(text);
  }
  return lines.join("\n");
}

function buildSingleEpisodeAiLiveVideoPrompt(parts = {}) {
  const labeledParts = [
    ["时间", parts.timeRange],
    ["转场", parts.transition],
    ["镜头", [parts.shotSize, parts.cameraMovement].filter(Boolean).join("/")],
    ["画面描述", parts.visualDescription],
    ["核心动作", parts.coreAction],
    ["对手戏设计", parts.interactionDesign],
    ["人物底层逻辑", parts.characterLogic],
    ["主体动作", parts.subjectAction],
    ["音效", parts.soundEffect],
    ["配乐", parts.bgm],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`);
  return [parts.baseVideoPrompt, ...labeledParts].filter(Boolean).join("\n");
}

function sanitizeSingleEpisodeAiPerShotVideoPrompt(prompt) {
  const text = String(prompt ?? "").trim();
  if (!text) {
    return "";
  }
  return text;
}

function normalizeSingleEpisodeAiPerShotTimeRange(timeRange, durationSec) {
  const duration = Number(durationSec ?? 0);
  if (Number.isFinite(duration) && duration > 0) {
    return `0-${Math.min(duration, 15)}秒`;
  }
  const parsed = parseSingleEpisodeAiTimeRange(timeRange);
  if (!parsed) {
    return String(timeRange ?? "");
  }
  const durationFromRange = Math.round((parsed.end - parsed.start) * 100) / 100;
  return durationFromRange > 0 ? `0-${Math.min(durationFromRange, 15)}秒` : String(timeRange ?? "");
}

function hasSingleEpisodeAiOutOfBoundsTimeline(value) {
  return findSingleEpisodeAiTimeRanges(value).some((range) => range.end > 15 || range.end - range.start > 15);
}

function parseSingleEpisodeAiTimeRange(value) {
  return findSingleEpisodeAiTimeRanges(value)[0] ?? null;
}

function findSingleEpisodeAiTimeRanges(value) {
  const ranges = [];
  const pattern = /(\d+(?:\.\d+)?)\s*(?:秒|s)?\s*[-~～—–至到]\s*(\d+(?:\.\d+)?)\s*(?:秒|s)?/gi;
  let match;
  while ((match = pattern.exec(String(value ?? "")))) {
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      ranges.push({ start, end });
    }
  }
  return ranges;
}

const AI_LIVE_TABLE_TITLES = {
  scenes: "场景",
  characters: "角色",
  props: "道具",
  storyboards: "分镜",
};

function createEmptySingleEpisodeLookSelection() {
  return { genre: [], emotion: [] };
}

function normalizeSingleEpisodeLookType(value) {
  return ["genre", "emotion"].includes(value) ? value : "";
}

function hasStoryboardPromptPackagesForType(workbench, type) {
  return Array.isArray(workbench.ui.storyboardPromptPackages) &&
    workbench.ui.storyboardPromptPackages.some((item) => {
      const packageType = String(item?.package_type ?? item?.packageType ?? "");
      const status = String(item?.status ?? "enabled");
      return packageType === type && status !== "disabled";
    });
}

function resolveSingleEpisodeSelectedPromptPackageId(workbench, type) {
  const normalizedType = normalizeSingleEpisodeLookType(type);
  if (!normalizedType) {
    return "";
  }
  const selected = workbench.ui.selectedSingleEpisodeLookPackageIds?.[normalizedType] ?? [];
  const selectedId = Array.isArray(selected) ? String(selected[0] ?? "") : "";
  if (selectedId) {
    return selectedId;
  }
  const fallback = (workbench.ui.storyboardPromptPackages ?? []).find((item) => {
    const packageType = String(item?.package_type ?? item?.packageType ?? "");
    const status = String(item?.status ?? "enabled");
    return packageType === normalizedType && status !== "disabled";
  });
  return fallback?.id ? String(fallback.id) : "";
}

function toggleSingleEpisodeLookPackage(workbench, input = {}) {
  const type = normalizeSingleEpisodeLookType(input.type);
  if (!type) {
    return;
  }
  const packageId = String(input.packageId ?? "").trim();
  if (!packageId) {
    return;
  }
  const current = {
    ...createEmptySingleEpisodeLookSelection(),
    ...(workbench.ui.selectedSingleEpisodeLookPackageIds ?? {}),
  };
  const selected = Array.isArray(current[type]) ? current[type].map(String) : [];
  if (packageId === "auto") {
    current[type] = [];
    workbench.ui.selectedSingleEpisodeLookPackageIds = current;
    workbench.ui.singleEpisodeLookPanel = type;
    return;
  }
  current[type] = selected.includes(packageId) ? [] : [packageId];
  workbench.ui.selectedSingleEpisodeLookPackageIds = current;
  workbench.ui.singleEpisodeLookPanel = type;
}

async function enterEpisodeWorkbench(workbench, episodeId, options = {}) {
  const previousStoryboardId = workbench.ui.selectedStoryboardId ?? null;
  const availableEpisodes = getDetailEpisodes(workbench.state);
  const hasRealEpisodes = availableEpisodes.some((episode) => episode?.id && episode.id !== "episode-primary");
  const canUsePrimaryFallback =
    !hasRealEpisodes && availableEpisodes.some((episode) => episode?.id === "episode-primary");
  const candidateEpisodeId = episodeId ?? (canUsePrimaryFallback ? "episode-primary" : null);
  const resolvedEpisodeId =
    candidateEpisodeId && candidateEpisodeId !== "episode-primary"
      ? resolvePersistedEpisodeWorkbenchId(workbench, candidateEpisodeId)
      : candidateEpisodeId;
  let storyboards = getEpisodeStoryboards(workbench, resolvedEpisodeId);
  workbench.ui.episodeWorkbenchError = "";
  resetEpisodeWorkbenchAssets(workbench);

  if (
    resolvedEpisodeId &&
    resolvedEpisodeId !== "episode-primary" &&
    typeof workbench.api.getEpisodeWorkbench === "function"
  ) {
    try {
      const context = await workbench.api.getEpisodeWorkbench(resolvedEpisodeId);
      const resolvedContext = resolveEpisodeWorkbenchContextPayload(context);
      workbench.ui.episodeWorkbenchContext = context;
      workbench.ui.selectedProjectCardId =
        resolvedContext?.project?.projectId ??
        resolvedContext?.episode?.projectId ??
        context?.project?.projectId ??
        context?.episode?.projectId ??
        workbench.ui.selectedProjectCardId;
      applyEpisodeWorkbenchAssetsFromContext(workbench, context);
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
  workbench.ui.museScopeMode = options.scopeMode ?? workbench.ui.museScopeMode ?? "storyboard";
  syncSelectedEpisodeAssetForCurrentTab(workbench);
  syncPromptFromCurrentScope(workbench);
  if (workbench.ui.museScopeMode === "assets") {
    await loadSelectedAssetConversationHistory(workbench, { mediaKind: "image" });
  }
  await restoreEpisodeGenerationTasksForWorkbench(workbench, resolvedEpisodeId);
  if (workbench.ui.museScopeMode === "storyboard") {
    if ((workbench.ui.episodeMediaMode ?? "image") === "image") {
      workbench.ui.episodeMediaMode = "video";
    }
    const activeStoryboards = getEpisodeStoryboards(workbench, resolvedEpisodeId, storyboards);
    const preferredStoryboardId = activeStoryboards.some((storyboard) => storyboard.id === previousStoryboardId)
      ? previousStoryboardId
      : (activeStoryboards[0]?.id ?? null);
    workbench.ui.selectedStoryboardId = preferredStoryboardId;
    if (preferredStoryboardId) {
      await loadSelectedStoryboardConversationHistory(workbench, {
        storyboardId: preferredStoryboardId,
        mediaKind: resolveStoryboardConversationMediaKind(workbench),
      });
    } else {
      workbench.ui.imageGenerationResult = null;
      workbench.ui.videoGenerationResult = null;
    }
  }
  if (options.toast) {
    workbench.ui.toast = options.toast;
  } else if (workbench.ui.episodeWorkbenchError) {
    workbench.ui.toast = `剧集工作台加载失败：${workbench.ui.episodeWorkbenchError}`;
  }
  if (!options.preserveRoute) {
    const projectId =
      workbench.ui.selectedProjectCardId ??
      workbench.state?.project?.id ??
      workbench.ui.episodeWorkbenchContext?.project?.projectId ??
      workbench.ui.episodeWorkbenchContext?.episode?.projectId ??
      null;
    const nextHash =
      projectId && resolvedEpisodeId && resolvedEpisodeId !== "episode-primary"
        ? `projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(resolvedEpisodeId)}`
        : "episode-workbench";
    if (globalThis.window?.location) {
      globalThis.window.location.hash = nextHash;
    }
  }
  if (options.shouldRender !== false) {
    render(workbench);
  }
}

function resetEpisodeWorkbenchAssets(workbench) {
  workbench.ui.importedAssets = {
    ...(workbench.ui.importedAssets ?? {}),
    character: [],
    scene: [],
    prop: [],
    other: {
      image: [...(workbench.ui.importedAssets?.other?.image ?? [])],
      video: [...(workbench.ui.importedAssets?.other?.video ?? [])],
    },
  };
  workbench.ui.selectedEpisodeCardId = null;
  workbench.ui.selectedEpisodeAssetId = null;
  workbench.ui.selectedEpisodeAssetIds = [];
}

function applyEpisodeWorkbenchAssetsFromContext(workbench, context) {
  const resolvedContext = resolveEpisodeWorkbenchContextPayload(context);
  const assetsByType =
    resolvedContext?.assetsByType ??
    resolvedContext?.assets ??
    resolvedContext?.episodeAssets ??
    context?.data?.assetsByType ??
    context?.data?.assets ??
    context?.data?.episodeAssets ??
    context?.assetsByType ??
    context?.assets ??
    context?.episodeAssets ??
    null;
  if (!assetsByType || typeof assetsByType !== "object") {
    resetEpisodeWorkbenchAssets(workbench);
    return workbench.ui.importedAssets;
  }
  const characterAssets = resolveEpisodeWorkbenchAssetEntries(assetsByType, "character");
  const sceneAssets = resolveEpisodeWorkbenchAssetEntries(assetsByType, "scene");
  const propAssets = resolveEpisodeWorkbenchAssetEntries(assetsByType, "prop");
  const existingImportedAssets = cloneImportedAssets(workbench.ui.importedAssets);
  workbench.ui.importedAssets = {
    ...(workbench.ui.importedAssets ?? {}),
    character: applyAssetConversationPreviewFallback(
      preserveRealEpisodeAssetPreviews(
        existingImportedAssets.character,
        mapEpisodeAssetContracts(characterAssets, "character"),
      ),
      workbench.ui.assetConversationHistory ?? {},
    ),
    scene: applyAssetConversationPreviewFallback(
      preserveRealEpisodeAssetPreviews(
        existingImportedAssets.scene,
        mapEpisodeAssetContracts(sceneAssets, "scene"),
      ),
      workbench.ui.assetConversationHistory ?? {},
    ),
    prop: applyAssetConversationPreviewFallback(
      preserveRealEpisodeAssetPreviews(
        existingImportedAssets.prop,
        mapEpisodeAssetContracts(propAssets, "prop"),
      ),
      workbench.ui.assetConversationHistory ?? {},
    ),
    other: {
      image: [...(workbench.ui.importedAssets?.other?.image ?? [])],
      video: [...(workbench.ui.importedAssets?.other?.video ?? [])],
    },
  };
  workbench.ui.selectedEpisodeCardId = null;
  workbench.ui.selectedEpisodeAssetId = null;
  workbench.ui.selectedEpisodeAssetIds = [];
  return workbench.ui.importedAssets;
}

async function ensureEpisodeWorkbenchAssetsHydrated(workbench) {
  if (
    !isRealEpisodeWorkbench(workbench) ||
    !workbench.ui.selectedEpisodeId ||
    typeof workbench.api.getEpisodeWorkbench !== "function"
  ) {
    return workbench.ui.importedAssets;
  }

  const context = await workbench.api.getEpisodeWorkbench(workbench.ui.selectedEpisodeId);
  const resolvedContext = resolveEpisodeWorkbenchContextPayload(context);
  workbench.ui.episodeWorkbenchContext = context;
  workbench.ui.selectedProjectCardId =
    resolvedContext?.project?.projectId ??
    resolvedContext?.episode?.projectId ??
    context?.project?.projectId ??
    context?.episode?.projectId ??
    workbench.ui.selectedProjectCardId;
  return applyEpisodeWorkbenchAssetsFromContext(workbench, context);
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

async function loadEpisodeStoryboardsForWorkbench(workbench, episodeId) {
  if (typeof workbench.api.listStoryboards !== "function") {
    return ensureEpisodeStoryboards(workbench, episodeId);
  }
  const page = await workbench.api.listStoryboards(episodeId, { page: 1, pageSize: 200 });
  const items = Array.isArray(page?.items) ? page.items : [];
  const mappedStoryboards = items.map(mapEpisodeStoryboardContract);
  const nextStoryboards = syncStoryboards(getEpisodeStoryboards(workbench, episodeId), mappedStoryboards);
  workbench.ui.episodeStoryboardMap = {
    ...workbench.ui.episodeStoryboardMap,
    [episodeId]: nextStoryboards,
  };
  return nextStoryboards;
}

async function loadEpisodeAssetsForWorkbench(workbench, episodeId) {
  if (typeof workbench.api.listEpisodeAssets !== "function") {
    resetEpisodeWorkbenchAssets(workbench);
    return workbench.ui.importedAssets;
  }
  const [characterPage, scenePage, propPage] = await Promise.all([
    workbench.api.listEpisodeAssets(episodeId, { assetType: "role", page: 1, pageSize: 200 }),
    workbench.api.listEpisodeAssets(episodeId, { assetType: "scene", page: 1, pageSize: 200 }),
    workbench.api.listEpisodeAssets(episodeId, { assetType: "prop", page: 1, pageSize: 200 }),
  ]);
  const existingImportedAssets = cloneImportedAssets(workbench.ui.importedAssets);
  workbench.ui.importedAssets = {
    ...(workbench.ui.importedAssets ?? {
      character: [],
      scene: [],
      prop: [],
      other: { image: [], video: [] },
    }),
    character: applyAssetConversationPreviewFallback(
      preserveRealEpisodeAssetPreviews(
        existingImportedAssets.character,
        mapEpisodeAssetContracts(characterPage?.items, "character"),
      ),
      workbench.ui.assetConversationHistory ?? {},
    ),
    scene: applyAssetConversationPreviewFallback(
      preserveRealEpisodeAssetPreviews(
        existingImportedAssets.scene,
        mapEpisodeAssetContracts(scenePage?.items, "scene"),
      ),
      workbench.ui.assetConversationHistory ?? {},
    ),
    prop: applyAssetConversationPreviewFallback(
      preserveRealEpisodeAssetPreviews(
        existingImportedAssets.prop,
        mapEpisodeAssetContracts(propPage?.items, "prop"),
      ),
      workbench.ui.assetConversationHistory ?? {},
    ),
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
  if (Number.isFinite(Number(config?.creditBalance))) {
    workbench.ui.creditBalance = Number(config.creditBalance);
  }
  return workbench.ui.episodeGenerationConfig;
}

async function restoreEpisodeGenerationTasksForWorkbench(workbench, episodeId) {
  if (
    !episodeId ||
    episodeId === "episode-primary" ||
    typeof workbench.api?.listGenerationTasks !== "function"
  ) {
    return [];
  }
  try {
    const page = await workbench.api.listGenerationTasks(episodeId, { page: 1, pageSize: 20 });
    const tasks = Array.isArray(page?.items) ? page.items : [];
    const storyboards = getEpisodeStoryboards(workbench, episodeId);
    const storyboardByTargetId = new Map();
    for (const storyboard of storyboards) {
      for (const key of [storyboard?.id, storyboard?.linkedShotId, storyboard?.shotId, storyboard?.storyboardId]) {
        const normalizedKey = String(key ?? "").trim();
        if (normalizedKey) {
          storyboardByTargetId.set(normalizedKey, storyboard);
        }
      }
    }
    for (const task of [...tasks].reverse()) {
      const mediaKind = task?.kind === "video" || task?.result?.mediaKind === "video" ? "video" : "image";
      const targetId = String(task?.targetId ?? "").trim();
      const storyboard = storyboardByTargetId.get(targetId) ?? storyboards[0] ?? null;
      if (!storyboard) {
        continue;
      }
      applyEpisodeGenerationTaskResult(workbench, task, storyboard.id, mediaKind, {
        persistConversation: false,
      });
    }
    return tasks;
  } catch (error) {
    workbench.ui.episodeWorkbenchError = workbench.ui.episodeWorkbenchError || friendlyError(error);
    return [];
  }
}

function resolveConfiguredVideoModelCode(workbench, mode, fallback) {
  const config = workbench.ui.episodeGenerationConfig ?? {};
  const normalizedMode = mode === "first-frame" ? "image-to-video" : mode;
  const selectedModelCode = String(workbench.ui.selectedModelId ?? "").trim();
  const configuredDefault =
    typeof config.defaultVideoModelCode === "string" && config.defaultVideoModelCode.trim()
      ? config.defaultVideoModelCode.trim()
      : "";
  const models = Array.isArray(config.models) ? config.models : [];
  const selectedModel = models.find((model) => model?.modelCode === selectedModelCode);
  if (
    selectedModelCode &&
    ((!models.length && !selectedModel) || (selectedModel && modelSupportsGenerationMode(selectedModel, normalizedMode)))
  ) {
    return selectedModelCode;
  }
  const defaultModel = models.find((model) => model?.modelCode === configuredDefault);
  if (configuredDefault && (!defaultModel || modelSupportsGenerationMode(defaultModel, normalizedMode))) {
    return configuredDefault;
  }
  const configuredModel = models.find((model) => modelSupportsGenerationMode(model, normalizedMode));
  return configuredModel?.modelCode ?? fallback;
}

function resolveConfiguredImageModelCode(workbench, mode, fallback) {
  const config = workbench.ui.episodeGenerationConfig ?? {};
  const selectedModelCode = String(workbench.ui.selectedModelId ?? "").trim();
  const configuredDefault =
    typeof config.defaultImageModelCode === "string" && config.defaultImageModelCode.trim()
      ? config.defaultImageModelCode.trim()
      : "";
  const models = Array.isArray(config.models) ? config.models : [];
  const selectedModel = models.find((model) => model?.modelCode === selectedModelCode);
  if (
    selectedModelCode &&
    ((!models.length && !selectedModel) || (selectedModel && modelSupportsGenerationMode(selectedModel, mode)))
  ) {
    return selectedModelCode;
  }
  const defaultModel = models.find((model) => model?.modelCode === configuredDefault);
  if (configuredDefault && (!defaultModel || modelSupportsGenerationMode(defaultModel, mode))) {
    return configuredDefault;
  }
  const configuredModel = models.find((model) => modelSupportsGenerationMode(model, mode));
  return configuredModel?.modelCode ?? fallback;
}

function findConfiguredGenerationModel(workbench, modelCode) {
  const normalizedModelCode = String(modelCode ?? "").trim();
  if (!normalizedModelCode) {
    return null;
  }
  const models = Array.isArray(workbench.ui?.episodeGenerationConfig?.models)
    ? workbench.ui.episodeGenerationConfig.models
    : [];
  return models.find((model) => String(model?.modelCode ?? model?.id ?? "").trim() === normalizedModelCode) ?? null;
}

function normalizeGenerationOptionValues(values) {
  return Array.isArray(values)
    ? values.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function firstGenerationValue(...candidates) {
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (value) {
      return value;
    }
  }
  return "";
}

function applySelectedModelGenerationDefaults(workbench, mediaKind = "") {
  const model = findConfiguredGenerationModel(workbench, workbench.ui.selectedModelId);
  if (!model) {
    return;
  }
  const defaults = model.defaultParams && typeof model.defaultParams === "object"
    ? model.defaultParams
    : {};
  const ratios = normalizeGenerationOptionValues(model.supportedRatios);
  const qualities = normalizeGenerationOptionValues(model.supportedQuality);
  const durations = normalizeGenerationOptionValues(model.supportedDurations);
  const resolvedMediaKind = mediaKind || (String(model.mediaType ?? "") === "video" ? "video" : "image");
  const aspectRatio = firstGenerationValue(defaults.aspectRatio, ratios[0]);
  const quality = firstGenerationValue(defaults.quality, defaults.resolution, qualities[0]);
  const count = Number(defaults.count);

  workbench.ui.generationParameterValues = {
    ...(workbench.ui.generationParameterValues ?? {}),
    ...defaults,
  };

  if (aspectRatio) {
    workbench.ui.imageAspectRatio = aspectRatio;
    workbench.ui.generationParameterValues.imageAspectRatio = aspectRatio;
    workbench.ui.generationParameterValues.aspectRatio = aspectRatio;
  }
  if (resolvedMediaKind === "video") {
    const duration = firstGenerationValue(defaults.durationSec, durations[0]);
    if (quality) {
      workbench.ui.videoResolution = quality;
      workbench.ui.generationParameterValues.videoResolution = quality;
      workbench.ui.generationParameterValues.resolution = quality;
    }
    if (duration) {
      workbench.ui.videoDurationSec = duration;
      workbench.ui.generationParameterValues.videoDurationSec = duration;
      workbench.ui.generationParameterValues.durationSec = duration;
    }
    if (Number.isFinite(count) && count > 0) {
      workbench.ui.videoCount = Math.floor(count);
      workbench.ui.generationParameterValues.count = Math.floor(count);
    }
    return;
  }
  if (quality) {
    workbench.ui.imageResolution = quality;
    workbench.ui.generationParameterValues.imageResolution = quality;
    workbench.ui.generationParameterValues.quality = quality;
  }
  if (Number.isFinite(count) && count > 0) {
    workbench.ui.imageCount = Math.floor(count);
    workbench.ui.generationParameterValues.count = Math.floor(count);
  }
}

function modelSupportsGenerationMode(model, mode) {
  const supportedModes = Array.isArray(model?.supportedModes)
    ? model.supportedModes.map((item) => normalizeGenerationModeToken(item)).filter(Boolean)
    : [];
  if (!supportedModes.length) {
    return false;
  }
  const aliases = generationModeAliases(mode);
  return supportedModes.some((supportedMode) => aliases.has(supportedMode));
}

function generationModeAliases(mode) {
  const normalized = normalizeGenerationModeToken(mode);
  const aliases = new Set([normalized]);
  if (normalized === "first-frame") {
    aliases.add("first_frame");
    aliases.add("image-to-video");
    aliases.add("image_to_video");
    aliases.add("video_image_to_video");
    aliases.add("video_text_to_video");
    aliases.add("video");
    aliases.add("video_generate");
  } else if (normalized === "image-to-video") {
    aliases.add("first-frame");
    aliases.add("first_frame");
    aliases.add("image_to_video");
    aliases.add("video_image_to_video");
    aliases.add("video_text_to_video");
    aliases.add("video");
    aliases.add("video_generate");
  } else if (normalized === "reference-video") {
    aliases.add("reference_video");
    aliases.add("image-to-video");
    aliases.add("image_to_video");
    aliases.add("video_reference_generate");
    aliases.add("video_reference_video");
    aliases.add("video_image_to_video");
    aliases.add("video");
    aliases.add("video_generate");
  } else if (normalized === "first-last-frame") {
    aliases.add("first_last_frame");
    aliases.add("video_first_last_frame");
    aliases.add("video_image_to_video");
    aliases.add("video");
    aliases.add("video_generate");
  } else if (normalized === "edit-video") {
    aliases.add("edit_video");
    aliases.add("video_edit_video");
    aliases.add("video");
    aliases.add("video_edit");
  } else if (normalized === "single-image") {
    aliases.add("single_image");
    aliases.add("text_to_image");
    aliases.add("image_to_image");
    aliases.add("image_generate");
    aliases.add("image_edit");
    aliases.add("image");
  } else if (normalized === "multi-image") {
    aliases.add("multi_image");
    aliases.add("multi_reference");
    aliases.add("image_to_image");
    aliases.add("image_reference_generate");
    aliases.add("image_edit");
    aliases.add("image");
  }
  return aliases;
}

function normalizeGenerationModeToken(mode) {
  return String(mode ?? "").trim().replaceAll(".", "_");
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
  workbench.ui.scriptSubmitLabel = "确认上传";
  workbench.ui.singleEpisodeNotice = "";
  workbench.ui.uploadNotice = "";
  render(workbench);
}

function hasFirstFrame(workbench) {
  const selectedStoryboard = getSelectedStoryboard(
    getActiveStoryboards(workbench),
    workbench.ui.selectedStoryboardId,
  );
  const generationState = selectedStoryboard?.generationState ?? createEmptyGenerationState();
  if (selectedStoryboard?.imageStatus === "ready") {
    return true;
  }
  if (generationState?.firstFrame?.url || generationState?.imageReference?.url) {
    return true;
  }
  if ((generationState?.quickReferenceItems ?? []).some((item) => String(item?.kind ?? "") === "image" && item?.url)) {
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

export async function handleTeamAssetLocalUploadFiles(workbench, category, files = []) {
  const normalizedCategory = String(category ?? workbench.ui?.libraryCategory ?? "character");
  if (!canSyncTeamAssetLocalUploadsToCloud(workbench)) {
    workbench.ui.libraryTeamAssetScope = "team";
    workbench.ui.libraryCategory = normalizedCategory;
    workbench.ui.isLibraryPricingModalOpen = true;
    workbench.ui.toast = "团队资产库为会员权益，开通后才能上传素材。";
    render(workbench, { preserveLibraryScroll: true });
    return;
  }

  const nextFiles = [...files].filter(Boolean);
  const existingUploadsByCategory = workbench.ui.teamAssetLocalUploads ?? {};
  const existingUploads = Array.isArray(existingUploadsByCategory[normalizedCategory])
    ? existingUploadsByCategory[normalizedCategory]
    : [];
  const availableSlots = Math.max(0, TEAM_ASSET_LOCAL_UPLOAD_LIMIT - existingUploads.length);
  const acceptedRecords = [];
  const acceptedItems = [];
  let skippedCount = 0;
  let validationMessage = "";

  for (const [index, file] of nextFiles.entries()) {
    if (acceptedRecords.length >= availableSlots) {
      skippedCount += 1;
      continue;
    }

    const validation = validateTeamAssetLocalUploadFile(normalizedCategory, file);
    if (!validation.ok) {
      skippedCount += 1;
      validationMessage = validation.message ?? validationMessage;
      continue;
    }

    const previewUrl = await createTeamAssetLocalPreviewUrl(file, validation.mediaType);
    const record = {
      id: createTeamAssetLocalUploadId(normalizedCategory, file, index),
      category: normalizedCategory,
      name: normalizeTeamAssetLocalUploadName(file.name),
      fileName: file.name ?? "upload",
      previewUrl,
      sourceUrl: "",
      sizeLabel: formatTeamAssetLocalUploadSize(file.size),
      mimeType: file.type || validation.mimeType || "",
      extension: validation.extension ?? "",
      status: "uploading",
      statusLabel: "上传中",
      uploadSessionId: null,
      storageObjectId: null,
      storageObjectKey: "",
    };
    acceptedRecords.push(record);
    acceptedItems.push({ record, file });
  }

  if (!acceptedRecords.length) {
    workbench.ui.toast =
      validationMessage ||
      (skippedCount > 0 ? "本分类最多保留 20 个本地上传预览。" : "请选择可上传的图片或音频文件。");
    render(workbench, { preserveLibraryScroll: true });
    return;
  }

  workbench.ui.libraryTeamAssetScope = "team";
  workbench.ui.libraryCategory = normalizedCategory;
  workbench.ui.teamAssetLocalUploads = {
    ...existingUploadsByCategory,
    [normalizedCategory]: [...acceptedRecords, ...existingUploads].slice(0, TEAM_ASSET_LOCAL_UPLOAD_LIMIT),
  };
  workbench.ui.toast = buildTeamAssetLocalUploadToast(acceptedRecords.length, skippedCount, "正在保存到团队资产库...");
  render(workbench, { preserveLibraryScroll: true });

  const uploadFailures = [];
  for (const { record, file } of acceptedItems) {
    try {
      const upload = await uploadTeamAssetLocalFile(workbench, normalizedCategory, file);
      record.status = "ready";
      record.statusLabel = "";
      record.uploadSessionId = upload.uploadSessionId ?? null;
      record.storageObjectId = upload.storageObjectId ?? null;
      record.storageObjectKey = upload.storageObjectKey ?? "";
      record.sourceUrl = upload.sourceUrl ?? upload.publicUrl ?? "";
      record.publicUrl = upload.publicUrl ?? upload.sourceUrl ?? "";
      record.mimeType = upload.mimeType ?? record.mimeType;
      record.sizeLabel = formatTeamAssetLocalUploadSize(upload.byteSize ?? file.size);
    } catch (error) {
      record.status = "failed";
      record.statusLabel = "上传失败";
      uploadFailures.push(friendlyError(error));
    }
  }

  workbench.ui.toast = uploadFailures.length
    ? `已添加 ${acceptedRecords.length} 个团队素材，${uploadFailures.length} 个上传失败。`
    : buildTeamAssetLocalUploadToast(acceptedRecords.length, skippedCount, "已保存到团队资产库。");
  render(workbench, { preserveLibraryScroll: true });
}

function canSyncTeamAssetLocalUploadsToCloud(workbench) {
  return workbench.ui?.libraryEntitlement?.hasTeamAssetLibrary === true;
}

async function uploadTeamAssetLocalFile(workbench, category, file) {
  if (typeof workbench.api?.uploadFile !== "function") {
    throw new Error("云存储接口暂不可用，请稍后重试。");
  }
  return uploadLocalFile(workbench, file, `${TEAM_ASSET_LOCAL_UPLOAD_CATEGORY_PREFIX}/${category}`, {
    uploadLimits: getTeamAssetLocalUploadLimits(category),
  });
}

function getTeamAssetLocalUploadLimits(category) {
  if (category === "voice") {
    return {
      ...defaultUploadLimits,
      image: undefined,
      video: undefined,
      audio: {
        ...defaultUploadLimits.audio,
        mimeTypes: [
          "application/octet-stream",
          "audio/mpeg",
          "audio/mp3",
          "audio/wav",
          "audio/x-wav",
          "audio/mp4",
          "audio/aac",
          "audio/x-m4a",
        ],
        extensions: [".mp3", ".wav", ".m4a", ".aac"],
      },
    };
  }

  return {
    ...defaultUploadLimits,
    image: {
      ...defaultUploadLimits.image,
      mimeTypes: ["application/octet-stream", "image/png", "image/jpeg", "image/webp"],
      extensions: [".png", ".jpg", ".jpeg", ".webp"],
    },
    video: undefined,
    audio: undefined,
  };
}

async function createTeamAssetLocalPreviewUrl(file, mediaType) {
  if (mediaType === "audio") {
    return createObjectUrlPreview(file);
  }
  try {
    return await readFileAsDataUrl(file);
  } catch {
    return createObjectUrlPreview(file);
  }
}

function createObjectUrlPreview(file) {
  if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
    try {
      return URL.createObjectURL(file);
    } catch {
      return "";
    }
  }
  return "";
}

function createTeamAssetLocalUploadId(category, file, index) {
  const randomToken =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `team-local-${category}-${index}-${randomToken}`;
}

function normalizeTeamAssetLocalUploadName(fileName) {
  const baseName = String(fileName ?? "")
    .replace(/\.[^.\\/]+$/, "")
    .trim();
  return baseName || "未命名素材";
}

function formatTeamAssetLocalUploadSize(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let size = numeric;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const rounded = size >= 10 || unitIndex === 0 ? Math.round(size) : Math.round(size * 10) / 10;
  return `${rounded} ${units[unitIndex]}`;
}

function buildTeamAssetLocalUploadToast(acceptedCount, skippedCount, suffix) {
  const skippedCopy = skippedCount > 0 ? `，${skippedCount} 个文件已跳过` : "";
  return `已添加 ${acceptedCount} 个团队素材预览${skippedCopy}，${suffix}`;
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
  await refreshProjectLibraryIfAvailable(workbench);
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
  workbench.ui.generationParameterValues = {
    ...(workbench.ui.generationParameterValues ?? {}),
    [field]: value,
  };
  if (field === "aspectRatio") {
    workbench.ui.imageAspectRatio = value || "16:9";
    workbench.ui.generationParameterValues.imageAspectRatio = workbench.ui.imageAspectRatio;
    return;
  }
  if (field === "quality") {
    workbench.ui.imageResolution = value || "2K";
    workbench.ui.generationParameterValues.imageResolution = workbench.ui.imageResolution;
    return;
  }
  if (field === "resolution") {
    if ((workbench.ui.episodeMediaMode ?? "image") === "video") {
      workbench.ui.videoResolution = value || "1080p";
      workbench.ui.generationParameterValues.videoResolution = workbench.ui.videoResolution;
    } else {
      workbench.ui.imageResolution = value || "2K";
      workbench.ui.generationParameterValues.imageResolution = workbench.ui.imageResolution;
    }
    return;
  }
  if (field === "count") {
    const count = clampCount(value, 1, 4);
    if ((workbench.ui.episodeMediaMode ?? "image") === "video") {
      workbench.ui.videoCount = count;
    } else {
      workbench.ui.imageCount = count;
    }
    workbench.ui.generationParameterValues.count = count;
    return;
  }
  if (field === "durationSec") {
    workbench.ui.videoDurationSec = value || "5";
    workbench.ui.generationParameterValues.videoDurationSec = workbench.ui.videoDurationSec;
    return;
  }
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

function isAssetScope(workbench) {
  return (workbench.ui.museScopeMode ?? "storyboard") === "assets";
}

function getCurrentScopePrompt(workbench, options = {}) {
  const allowPromptFallback = options.allowPromptFallback !== false;
  if (isAssetScope(workbench)) {
    const draft = workbench.ui.assetPromptDraft ?? null;
    const selectedAssetId = String(
      workbench.ui.selectedEpisodeAssetId ?? workbench.ui.selectedEpisodeCardId ?? "",
    ).trim();
    const draftAssetId = String(draft?.selectionContext?.selectedAssetId ?? "").trim();
    if (draftAssetId && selectedAssetId && draftAssetId !== selectedAssetId) {
      return allowPromptFallback ? String(workbench.ui.prompt ?? "") : "";
    }
    if (allowPromptFallback && String(workbench.ui.prompt ?? "").trim()) {
      return String(workbench.ui.prompt ?? "");
    }
    return String(draft?.prompt ?? (allowPromptFallback ? workbench.ui.prompt : "") ?? "");
  }
  if (allowPromptFallback && String(workbench.ui.prompt ?? "").trim()) {
    return String(workbench.ui.prompt ?? "");
  }
  const selectedStoryboard = getSelectedStoryboard(
    getActiveStoryboards(workbench),
    workbench.ui.selectedStoryboardId,
  );
  return String(
    resolveStoryboardPromptForMode(selectedStoryboard, workbench.ui.episodeMediaMode ?? "image") ??
      (allowPromptFallback ? workbench.ui.prompt : "") ??
      "",
  );
}

function setCurrentScopePrompt(workbench, value) {
  const nextValue = String(value ?? "");
  if (isAssetScope(workbench)) {
    const selectionContext = resolveEpisodeAssetSelectionContext(workbench);
    workbench.ui.assetPromptDraft = {
      ...(workbench.ui.assetPromptDraft ?? {}),
      scopeMode: "assets",
      prompt: nextValue,
      selectionContext: {
        ...(workbench.ui.assetPromptDraft?.selectionContext ?? {}),
        ...selectionContext,
      },
    };
    workbench.ui.prompt = nextValue;
    return;
  }
  const storyboardId = workbench.ui.selectedStoryboardId ?? null;
  if (storyboardId) {
    updateStoryboardGenerationState(workbench, storyboardId, (generationState) => ({
      ...generationState,
      prompt: nextValue,
      ...(workbench.ui.episodeMediaMode === "video" || workbench.ui.episodeMediaMode === "lip-sync"
        ? { videoPrompt: nextValue }
        : workbench.ui.episodeMediaMode === "image"
          ? { imagePrompt: nextValue }
          : {}),
    }));
  }
  workbench.ui.prompt = nextValue;
}

function syncPromptInputFromDom(workbench) {
  const input = workbench?.root?.querySelector?.("#video-prompt-input");
  if (!input) {
    return;
  }
  setCurrentScopePrompt(workbench, input.value ?? "");
}

function syncPromptFromCurrentScope(workbench) {
  workbench.ui.prompt = getCurrentScopePrompt(workbench, { allowPromptFallback: false });
}

function clearAssetPromptDraftForCurrentSelection(workbench) {
  if (!isAssetScope(workbench)) {
    return;
  }
  const draft = workbench.ui.assetPromptDraft ?? null;
  if (!draft) {
    return;
  }
  const selectedAssetId = String(
    workbench.ui.selectedEpisodeAssetId ?? workbench.ui.selectedEpisodeCardId ?? "",
  ).trim();
  const draftAssetId = String(draft?.selectionContext?.selectedAssetId ?? "").trim();
  if (!selectedAssetId || draftAssetId === selectedAssetId) {
    return;
  }
  workbench.ui.assetPromptDraft = {
    scopeMode: "assets",
    prompt: "",
    quickReferenceItems: [],
    mentionReferences: [],
    selectionContext: {
      ...resolveEpisodeAssetSelectionContext(workbench),
    },
  };
}

function normalizeStoryboardComposerState(workbench, storyboardId) {
  if (!storyboardId || isAssetScope(workbench)) {
    return;
  }
  updateStoryboardGenerationState(workbench, storyboardId, (generationState) => {
    const quickReferenceItems = Array.isArray(generationState?.quickReferenceItems)
      ? generationState.quickReferenceItems.filter((item) => {
          const kind = String(item?.kind ?? "").trim();
          return item?.assetId === storyboardId || kind === "image" || kind === "storyboard" || kind === "video";
        })
      : [];
    return {
      ...generationState,
      quickReferenceItems,
    };
  });
}

function resolveActiveStoryboardContextFromDom(workbench) {
  const root = workbench?.root;
  if (!root) {
    return null;
  }
  const activeCard =
    root.querySelector(".episode-replica-shot-card.active[data-storyboard-id]") ??
    root.querySelector(".episode-replica-shot-shell.active .episode-replica-shot-card[data-storyboard-id]") ??
    root.querySelector(".episode-replica-shot-shell.active[data-storyboard-id]") ??
    root.querySelector(".episode-replica-storyboard-item.active[data-storyboard-id]") ??
    null;
  const storyboardId =
    activeCard?.getAttribute("data-storyboard-id")?.trim() ??
    activeCard?.querySelector?.("[data-storyboard-id]")?.getAttribute?.("data-storyboard-id")?.trim() ??
    workbench?.ui?.selectedStoryboardId ??
    null;
  const description =
    activeCard?.querySelector(".episode-replica-shot-desc-input")?.value?.trim() ??
    activeCard?.querySelector(".episode-replica-shot-desc-input")?.textContent?.trim() ??
    activeCard?.querySelector("textarea")?.value?.trim() ??
    activeCard?.querySelector("textarea")?.textContent?.trim() ??
    "";
  return storyboardId || description ? { storyboardId, description } : null;
}

function resolveActiveStoryboardReferenceImagesFromDom(workbench, storyboardId) {
  const root = workbench?.root;
  if (!root || !storyboardId) {
    return [];
  }
  const activeCard =
    root.querySelector(`.episode-replica-shot-card[data-storyboard-id="${storyboardId}"]`) ??
    root.querySelector(`.episode-replica-shot-shell.active .episode-replica-shot-card[data-storyboard-id="${storyboardId}"]`) ??
    null;
  const images = [...(activeCard?.querySelectorAll?.(".episode-replica-shot-ref-card img") ?? [])]
    .map((image, index) => {
      const src = image?.getAttribute?.("src")?.trim() ?? "";
      if (!src) {
        return null;
      }
      return {
        id: image?.getAttribute?.("data-reference-id")?.trim() ?? `storyboard-dom-ref-${index + 1}`,
        name: image?.getAttribute?.("alt")?.trim() ?? `引用${index + 1}`,
        preview: src,
        previewUrl: src,
      };
    })
    .filter(Boolean);
  return images;
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

  await runAction(workbench, "正在上传参考素材...", async () => {
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
      summary: "正在上传文件...",
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
        summary: stateKey === "editSourceVideo" ? "已上传待编辑视频" : "已上传参考素材",
        url: resolveApiUrl(upload.publicUrl),
        storageObjectKey: upload.storageObjectKey,
        storageObjectId: upload.storageObjectId ?? null,
        uploadSessionId: upload.uploadSessionId ?? null,
      },
    }));
    workbench.ui.toast = `已上传 ${file.name}。`;
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
  const image = findStoryboardImage(storyboard);
  if (!image?.src) {
    return;
  }

  updateStoryboardGenerationState(workbench, storyboardId, (state) => ({
    ...state,
    firstFrame: {
      name: storyboard.uploadedImageName || "storyboard-image",
      kind: "image",
      status: "ready",
      summary: "已引用当前分镜图片",
      url: image.src,
      preview: image.src,
      storageObjectId: image.storageObjectId ?? null,
      assetVersionId: image.assetVersionId ?? image.id ?? null,
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
  const assetEntries = importedAssetEntries;
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

function resolveCurrentEpisodeAssetTargetId(workbench, imageResult = null, assetKind = null) {
  const selectionContextAssetId = String(imageResult?.selectionContext?.selectedAssetId ?? "").trim();
  if (selectionContextAssetId) {
    return selectionContextAssetId;
  }
  const draftSelectionAssetId = String(workbench.ui.assetPromptDraft?.selectionContext?.selectedAssetId ?? "").trim();
  if (draftSelectionAssetId) {
    return draftSelectionAssetId;
  }
  const selectedEpisodeAssetId = String(workbench.ui.selectedEpisodeAssetId ?? "").trim();
  if (selectedEpisodeAssetId) {
    return selectedEpisodeAssetId;
  }
  const selectedEpisodeCardId = String(workbench.ui.selectedEpisodeCardId ?? "").trim();
  if (selectedEpisodeCardId) {
    return selectedEpisodeCardId;
  }
  const targetKind = String(assetKind ?? workbench.ui.projectAssetTab ?? "").trim();
  const targetBucket = targetKind ? workbench.ui.importedAssets?.[targetKind] : null;
  const firstTargetAssetId = Array.isArray(targetBucket) ? String(targetBucket[0]?.id ?? "").trim() : "";
  if (firstTargetAssetId) {
    return firstTargetAssetId;
  }
  const selectionContext = resolveEpisodeAssetSelectionContext(workbench);
  return String(selectionContext.selectedAssetId ?? "").trim() || null;
}

function resolveVisibleFixedResultImageUrl(target) {
  const containers = [
    target?.closest?.(".episode-replica-fixed-results"),
    target?.closest?.(".episode-replica-asset-conversation-entry"),
    target?.closest?.(".episode-replica-generated-stage"),
  ].filter(Boolean);
  for (const container of containers) {
    const image =
      container.querySelector?.(".episode-replica-fixed-image-card img") ??
      container.querySelector?.("img");
    const imageUrl = String(image?.currentSrc || image?.getAttribute?.("src") || "").trim();
    if (imageUrl) {
      return imageUrl;
    }
  }
  return "";
}

function hydrateQuickReferencePreviews(workbench, items = []) {
  return [...items].map((item) => {
    const existingPreview =
      item?.fixedImageUrl ??
      item?.preview ??
      item?.previewUrl ??
      item?.publicUrl ??
      item?.src ??
      item?.imageUrl ??
      item?.url ??
      "";
    if (existingPreview) {
      return item;
    }
    const asset = findEpisodeAssetForQuickReference(workbench, item);
    const preview =
      asset?.fixedImageUrl ??
      asset?.previewUrl ??
      asset?.preview ??
      asset?.publicUrl ??
      asset?.src ??
      "";
    if (!preview) {
      return item;
    }
    return {
      ...item,
      preview,
    };
  });
}

function findEpisodeAssetForQuickReference(workbench, item) {
  const assetId = item?.assetId ?? item?.id ?? null;
  const kind = item?.kind ?? item?.assetKind ?? workbench.ui.projectAssetTab ?? "character";
  if (!assetId) {
    return null;
  }
  const candidates = collectEpisodeAssetCandidates(workbench, kind);
  return candidates.find((asset) => (asset?.id ?? asset?.assetId) === assetId) ?? null;
}

function collectEpisodeAssetCandidates(workbench, kind) {
  const importedAssets = workbench.ui.importedAssets ?? {};
  const direct =
    kind === "other"
      ? [
          ...(importedAssets.other?.image ?? []),
          ...(importedAssets.other?.video ?? []),
        ]
      : (importedAssets[kind] ?? []);
  const context = workbench.ui.episodeWorkbenchContext ?? {};
  const contextAssets =
    context.assetsByType?.[kind] ??
    context.assets?.[kind] ??
    context.episodeAssets?.[kind] ??
    context.data?.assetsByType?.[kind] ??
    context.data?.assets?.[kind] ??
    context.data?.episodeAssets?.[kind] ??
    [];
  const projectAssets =
    workbench.ui.projectDetail?.assetsByType?.[kind] ??
    workbench.state?.projectDetail?.assetsByType?.[kind] ??
    [];
  return [
    ...direct,
    ...mapEpisodeAssetContracts(Array.isArray(contextAssets) ? contextAssets : [], kind),
    ...mapProjectDetailAssetRecords(Array.isArray(projectAssets) ? projectAssets : [], kind),
  ];
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
  const model = resolveConfiguredImageModelCode(
    workbench,
    workbench.ui.imageGenerationMode,
    workbench.ui.selectedModelId ?? "gpt-image-2-cn",
  );
  const configuredParameters = configuredGenerationParametersForModel(workbench, model);
  const qualityVisible = isConfiguredGenerationParameterVisible(workbench, model, "quality");
  const resolutionVisible = isConfiguredGenerationParameterVisible(workbench, model, "resolution");
  const aspectRatioVisible = isConfiguredGenerationParameterVisible(workbench, model, "aspectRatio");
  return {
    shotId: selectedStoryboard?.linkedShotId ?? null,
    promptOverride: getCurrentScopePrompt(workbench) || selectedStoryboard?.description || null,
    model,
    parameters: {
      ...configuredParameters,
      mode: workbench.ui.imageGenerationMode,
      count: clampCount(configuredParameters.count ?? workbench.ui.imageCount ?? 1, 1, 4),
      ...(qualityVisible ? { quality: configuredParameters.quality ?? workbench.ui.imageResolution ?? "2K" } : {}),
      ...(resolutionVisible ? { resolution: configuredParameters.resolution ?? workbench.ui.imageResolution ?? "2K" } : {}),
      ...(aspectRatioVisible ? { aspectRatio: configuredParameters.aspectRatio ?? workbench.ui.imageAspectRatio ?? workbench.state?.project?.aspectRatio ?? "9:16" } : {}),
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

function configuredGenerationParametersForModel(workbench, modelCode) {
  const model = findConfiguredGenerationModel(workbench, modelCode);
  const schema = model?.parameterSchema && typeof model.parameterSchema === "object" && !Array.isArray(model.parameterSchema)
    ? model.parameterSchema
    : {};
  const values = workbench.ui.generationParameterValues && typeof workbench.ui.generationParameterValues === "object"
    ? workbench.ui.generationParameterValues
    : {};
  const parameters = {};
  for (const key of Object.keys(schema)) {
    if (schema[key]?.visible === false) {
      continue;
    }
    if (["prompt", "negativePrompt", "referenceImages", "editInstruction"].includes(key)) {
      continue;
    }
    const value = resolveConfiguredGenerationParameterValue(
      schema[key],
      firstGenerationParameterCandidate(values[key], uiGenerationParameterFallback(workbench, key)),
      model?.defaultParams?.[key],
    );
    if (value !== undefined && value !== null && value !== "") {
      parameters[key] = value;
    }
  }
  return parameters;
}

function isConfiguredGenerationParameterVisible(workbench, modelCode, key) {
  const model = findConfiguredGenerationModel(workbench, modelCode);
  const schema = model?.parameterSchema && typeof model.parameterSchema === "object" && !Array.isArray(model.parameterSchema)
    ? model.parameterSchema
    : {};
  const parameter = schema[key];
  return !parameter || typeof parameter !== "object" || Array.isArray(parameter) || parameter.visible !== false;
}

function firstGenerationParameterCandidate(...candidates) {
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null && candidate !== "") {
      return candidate;
    }
  }
  return undefined;
}

function uiGenerationParameterFallback(workbench, key) {
  if (key === "aspectRatio") {
    return workbench.ui.imageAspectRatio;
  }
  if (key === "quality") {
    return workbench.ui.imageResolution;
  }
  if (key === "resolution") {
    return (workbench.ui.episodeMediaMode ?? "image") === "video"
      ? workbench.ui.videoResolution
      : workbench.ui.imageResolution;
  }
  if (key === "count") {
    return (workbench.ui.episodeMediaMode ?? "image") === "video"
      ? workbench.ui.videoCount
      : workbench.ui.imageCount;
  }
  if (key === "durationSec") {
    return workbench.ui.videoDurationSec;
  }
  return undefined;
}

function resolveConfiguredGenerationParameterValue(parameter, selectedValue, defaultValue) {
  const options = generationParameterOptionValues(parameter);
  if (!options.length) {
    return selectedValue !== undefined && selectedValue !== null && selectedValue !== "" ? selectedValue : defaultValue;
  }
  const candidates = [selectedValue, defaultValue, options[0]];
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null && candidate !== "" && options.includes(String(candidate))) {
      return candidate;
    }
  }
  return options[0];
}

function generationParameterOptionValues(parameter) {
  if (!parameter || typeof parameter !== "object" || Array.isArray(parameter)) {
    return [];
  }
  const rawOptions = Array.isArray(parameter.options)
    ? parameter.options
    : Array.isArray(parameter.enum)
      ? parameter.enum
      : [];
  const options = rawOptions
    .map((item) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        return String(item.value ?? item.providerValue ?? item.label ?? "").trim();
      }
      return String(item ?? "").trim();
    })
    .filter(Boolean);
  if (options.length || String(parameter.type ?? "") !== "integer") {
    return options;
  }
  const minimum = Number(parameter.minimum ?? parameter.min ?? 1);
  const maximum = Number(parameter.maximum ?? parameter.max ?? minimum);
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum < minimum || maximum - minimum > 12) {
    return [];
  }
  const values = [];
  for (let value = Math.ceil(minimum); value <= Math.floor(maximum); value += 1) {
    values.push(String(value));
  }
  return values;
}

export function buildVideoGenerationPayload(workbench) {
  const selectedStoryboard = getSelectedStoryboard(
    getActiveStoryboards(workbench),
    workbench.ui.selectedStoryboardId,
  );
  const generationState = selectedStoryboard?.generationState ?? createEmptyGenerationState();
  const videoMode = workbench.ui.episodeMediaMode === "lip-sync" ? "lip-sync" : workbench.ui.videoGenerationMode;
  const model = resolveConfiguredVideoModelCode(workbench, videoMode, workbench.ui.selectedModelId ?? "seedance-i2v-pro");
  return {
    shotId: selectedStoryboard?.linkedShotId ?? null,
    motionPrompt: getCurrentScopePrompt(workbench) || selectedStoryboard?.description || null,
    model,
    parameters: {
      mode: videoMode,
      count: clampCount(workbench.ui.videoCount ?? 1, 1, 4),
      resolution: workbench.ui.videoResolution ?? workbench.state?.project?.resolution ?? "1080p",
      durationSec: Number(workbench.ui.videoDurationSec ?? 5),
      aspectRatio: workbench.ui.imageAspectRatio ?? workbench.state?.project?.aspectRatio ?? "9:16",
      references: selectedStoryboard?.references ?? [],
      quickReferences: generationState.quickReferenceItems ?? [],
      mentionReferences: generationState.mentionReferences ?? [],
      firstFrame: generationState.firstFrame ?? null,
      lastFrame: generationState.lastFrame ?? null,
      editSourceVideo: generationState.editSourceVideo ?? null,
      referenceUploads: generationState.referenceUploads ?? [],
      imageReference: generationState.imageReference ?? null,
      localReferenceRoles: generationState.localReferenceRoles ?? [],
      lipSyncConfig:
        workbench.ui.episodeMediaMode === "lip-sync"
          ? {
              text: String(getCurrentScopePrompt(workbench) ?? ""),
              textLength: [...String(getCurrentScopePrompt(workbench) ?? "").trim()].length,
              voiceId: workbench.ui.lipSyncVoiceId ?? null,
              voiceName: workbench.ui.lipSyncVoiceName ?? "",
              voiceSource: workbench.ui.lipSyncVoiceSource ?? null,
              estimatedCreditCost: calculateLipSyncCreditCost(getCurrentScopePrompt(workbench) ?? ""),
            }
          : null,
    },
    audioEnabled: workbench.ui.episodeMediaMode === "lip-sync" ? true : Boolean(workbench.ui.videoAudioEnabled),
    musicEnabled: Boolean(workbench.ui.videoMusicEnabled),
    lipSyncEnabled: workbench.ui.episodeMediaMode === "lip-sync" ? true : Boolean(workbench.ui.videoLipSyncEnabled),
  };
}

export function appendSelectedEpisodeAssetToPrompt(workbench, options = {}) {
  const storyboardReferenceResult = appendSelectedStoryboardToPrompt(workbench, options);
  if (storyboardReferenceResult.ok) {
    return storyboardReferenceResult;
  }
  const selectionContext = resolveEpisodeAssetSelectionContext(workbench);
  const domSelectionContext = resolveEpisodeAssetSelectionContextFromDom(workbench);
  const currentAssetKind = selectionContext.assetTab ?? domSelectionContext?.assetTab;
  const selectedAsset = selectionContext.selectedAsset;
  const selectedAssetId = selectedAsset?.id ?? domSelectionContext?.selectedAssetId ?? null;
  const selectedAssetName =
    selectionContext.selectedAssetName ?? domSelectionContext?.selectedAssetName ?? selectedAsset?.name ?? null;
  const selectedAssetDescription =
    selectionContext.selectedAssetDescription ??
    domSelectionContext?.selectedAssetDescription ??
    selectedAsset?.description ??
    null;
  const selectedAssetPreview =
    selectionContext.selectedAssetPreview ??
    domSelectionContext?.selectedAssetPreview ??
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
  const isMention = Boolean(options?.mention);
  const mentionToken = `【@${selectedAssetName ?? "素材"}】`;
  const mentionReference = {
    id: `mention-ref:${currentAssetKind}:${selectedAssetId ?? Date.now()}`,
    assetId: selectedAssetId,
    kind: currentAssetKind,
    name: selectedAssetName ?? "引用素材",
    token: mentionToken,
    description: nextPrompt,
    preview: selectedAssetPreview,
  };
  if (selectedStoryboard) {
    updateStoryboardGenerationState(workbench, selectedStoryboard.id, (generationState) => ({
      ...generationState,
      quickReferenceItems: dedupeQuickReferenceItems([
        ...(generationState.quickReferenceItems ?? []),
        nextReference,
      ]),
      mentionReferences: isMention
        ? dedupeMentionReferenceItems([
            ...(generationState.mentionReferences ?? []),
            mentionReference,
          ])
        : (generationState.mentionReferences ?? []),
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
      mentionReferences: isMention
        ? dedupeMentionReferenceItems([
            ...(assetPromptDraft.mentionReferences ?? []),
            mentionReference,
          ])
        : (assetPromptDraft.mentionReferences ?? []),
    };
  }

  const promptLine = isMention
    ? mentionToken
    : selectedStoryboard && selectedAssetName
      ? `${selectedAssetName}: ${nextPrompt}`
      : nextPrompt;
  setCurrentScopePrompt(workbench, appendPromptLineOnce(getCurrentScopePrompt(workbench), promptLine));
  if (!selectedStoryboard && (workbench.ui.museScopeMode ?? "storyboard") === "assets") {
    workbench.ui.episodeWorkbenchConversationScrollMode = "latest";
  }
  workbench.ui.musePromptMenu = null;
  return {
    ok: true,
    prompt: workbench.ui.prompt,
    reference: isMention ? mentionReference : nextReference,
  };
}

function appendSelectedStoryboardToPrompt(workbench, options = {}) {
  if (options?.mention || (workbench.ui.museScopeMode ?? "storyboard") !== "storyboard") {
    return { ok: false, reason: "not-storyboard-reference" };
  }
  const activeStoryboardContext = resolveActiveStoryboardContextFromDom(workbench);
  if (!workbench.ui.selectedStoryboardId && activeStoryboardContext?.storyboardId) {
    workbench.ui.selectedStoryboardId = activeStoryboardContext.storyboardId;
  }
  const selectedStoryboard = getSelectedStoryboard(
    getActiveStoryboards(workbench),
    workbench.ui.selectedStoryboardId,
  );
  if (!selectedStoryboard) {
    return { ok: false, reason: "missing-storyboard" };
  }
  const promptText = activeStoryboardContext?.description || resolveStoryboardQuickReferencePrompt(selectedStoryboard);
  if (!promptText) {
    return { ok: false, reason: "missing-storyboard-prompt" };
  }
  const references = buildSelectedStoryboardQuickReference(workbench, selectedStoryboard, promptText);
  if (!references?.length) {
    const textReference = buildSelectedStoryboardTextQuickReference(selectedStoryboard, promptText);
    updateStoryboardGenerationState(workbench, selectedStoryboard.id, (generationState) => ({
      ...generationState,
      quickReferenceItems: dedupeQuickReferenceItems([
        ...(generationState.quickReferenceItems ?? []),
        textReference,
      ]),
    }));
    const currentPrompt = String(getCurrentScopePrompt(workbench) ?? "").trim();
    setCurrentScopePrompt(workbench, appendPromptLineOnce(currentPrompt, promptText));
    appendStoryboardMentionAudioAttachments(workbench, promptText);
    workbench.ui.musePromptMenu = null;
    return { ok: true, prompt: workbench.ui.prompt, reference: textReference, references: [textReference] };
  }
  updateStoryboardGenerationState(workbench, selectedStoryboard.id, (generationState) => ({
    ...generationState,
    quickReferenceItems: dedupeQuickReferenceItems([
      ...(generationState.quickReferenceItems ?? []),
      ...references,
    ]),
  }));

  const currentPrompt = String(getCurrentScopePrompt(workbench) ?? "").trim();
  const quickReferences = selectedStoryboard?.generationState?.quickReferenceItems ?? [];
  const hasExistingStoryboardReference = quickReferences.some((item) => item?.assetId === selectedStoryboard.id);
  const nextPrompt =
    !currentPrompt || currentPrompt === promptText || hasExistingStoryboardReference
      ? appendPromptLineOnce(currentPrompt, promptText)
      : promptText;
  setCurrentScopePrompt(workbench, nextPrompt);
  appendStoryboardMentionAudioAttachments(workbench, promptText);
  syncStoryboardQuickReferencesToVideoGenerationState(workbench, selectedStoryboard.id, references);
  workbench.ui.musePromptMenu = null;
  return { ok: true, prompt: workbench.ui.prompt, reference: references[0], references };
}

function buildSelectedStoryboardTextQuickReference(storyboard, description) {
  return {
    id: `quick-ref:storyboard-text:${storyboard.id}`,
    assetId: storyboard.id,
    sourceStoryboardId: storyboard.id,
    kind: "text",
    name: `${resolveStoryboardReferenceLabel(storyboard)} 文本`,
    description,
    preview: null,
    url: null,
    voiceId: null,
    voiceName: "",
    voiceSource: null,
  };
}

function appendPromptLineOnce(currentPrompt, promptLine) {
  const nextLine = String(promptLine ?? "").trim();
  if (!nextLine) {
    return String(currentPrompt ?? "").trim();
  }
  const currentText = String(currentPrompt ?? "").trim();
  if (!currentText) {
    return nextLine;
  }
  const existingLines = currentText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (existingLines.includes(nextLine)) {
    return currentText;
  }
  return `${currentText}\n${nextLine}`;
}

function resolveStoryboardQuickReferencePrompt(storyboard) {
  return String(
    storyboard?.description ??
      storyboard?.plotPreview ??
      storyboard?.sceneAnalysis ??
      storyboard?.title ??
      storyboard?.displayTitle ??
      "",
  ).trim();
}

function collectStoryboardMentionAudioMap(workbench, description) {
  const text = String(description ?? "").trim();
  if (!text) {
    return new Map();
  }
  const mentionNames = new Set();
  for (const match of text.matchAll(/(?:【@([^】]+)】|@([^\s【】,，。；;：:]+))/g)) {
    const mentionName = String(match?.[1] ?? match?.[2] ?? "").trim();
    if (mentionName) {
      mentionNames.add(mentionName);
    }
  }
  if (!mentionNames.size) {
    return new Map();
  }
  const mentionAssetBuckets = resolvePromptMentionAssetBuckets(workbench);
  const assets = [
    ...(mentionAssetBuckets.character ?? []).map((item) => ({ ...item, assetKind: "character" })),
    ...(mentionAssetBuckets.scene ?? []).map((item) => ({ ...item, assetKind: "scene" })),
    ...(mentionAssetBuckets.prop ?? []).map((item) => ({ ...item, assetKind: "prop" })),
  ];
  const audioMap = new Map();
  for (const asset of assets) {
    const name = String(asset?.name ?? asset?.label ?? "").trim();
    if (!name || !mentionNames.has(name)) {
      continue;
    }
    const voiceName = String(asset?.voiceName ?? "").trim();
    const voiceId = String(asset?.voiceId ?? "").trim();
    if (!voiceName && !voiceId) {
      continue;
    }
    audioMap.set(name, {
      assetId: asset?.id ?? null,
      assetKind: asset?.assetKind ?? asset?.kind ?? null,
      voiceId: asset?.voiceId ?? null,
      voiceName,
      voiceSource: asset?.voiceSource ?? inferEpisodeVoiceSource(asset),
    });
  }
  return audioMap;
}

function buildStoryboardMentionAudioAttachments(workbench, description) {
  const audioMap = collectStoryboardMentionAudioMap(workbench, description);
  if (!audioMap.size) {
    return [];
  }
  return [...audioMap.entries()].map(([name, audio], index) => ({
    id: `quick-mention-audio:${audio.assetKind ?? "asset"}:${audio.assetId ?? name}:${index + 1}`,
    type: "audio",
    kind: "audio",
    name: `${name} 音频`,
    summary: name,
    voiceId: audio.voiceId ?? null,
    voiceName: audio.voiceName ?? "",
    voiceSource: audio.voiceSource ?? null,
    audioUrl: buildEpisodeVoicePreviewDataUrl(`${audio.voiceName ?? ""}:${name}`),
  }));
}

function buildSelectedStoryboardQuickReference(workbench, storyboard, description) {
  const mediaMode = workbench.ui.episodeMediaMode === "video" || workbench.ui.episodeMediaMode === "lip-sync"
    ? "video"
    : "image";
  const mentionAudioMap = collectStoryboardMentionAudioMap(workbench, description);
  const storyboardReferences = Array.isArray(storyboard?.references) ? storyboard.references.filter(Boolean) : [];
  const domStoryboardReferences = resolveActiveStoryboardReferenceImagesFromDom(workbench, storyboard?.id ?? null);
  const mergedStoryboardReferences = dedupeQuickReferenceItems(
    [...storyboardReferences, ...domStoryboardReferences].map((item, index) => ({
      id: item?.id ?? item?.assetId ?? `storyboard-ref-${index + 1}`,
      assetId: item?.assetId ?? item?.id ?? null,
      role: item?.role ?? item?.kind ?? "character",
      kind: item?.kind ?? item?.role ?? "image",
      name: item?.name ?? item?.assetName ?? `引用${index + 1}`,
      preview: item?.previewUrl ?? item?.preview ?? item?.src ?? item?.url ?? null,
      previewUrl: item?.previewUrl ?? item?.preview ?? item?.src ?? item?.url ?? null,
      url: item?.url ?? item?.src ?? item?.previewUrl ?? item?.preview ?? null,
    })),
  );
  const image =
    (storyboard?.uploadedImages ?? []).find((item) => item.id === storyboard?.currentImageAssetVersionId && item.src) ??
    (storyboard?.uploadedImages ?? []).find((item) => item.status === "ready" && item.src) ??
    null;
  const previewImage = image?.src ?? storyboard?.previewImageUrl ?? null;
  const fallbackReferenceImage = mergedStoryboardReferences[0] ?? null;
  const resolvedPreviewImage =
    previewImage ??
    fallbackReferenceImage?.previewUrl ??
    fallbackReferenceImage?.preview ??
    fallbackReferenceImage?.src ??
    fallbackReferenceImage?.url ??
    null;
  if (!resolvedPreviewImage && !mergedStoryboardReferences.length) {
    return [];
  }
  if (mergedStoryboardReferences.length) {
    return mergedStoryboardReferences.map((item, index) => {
      const matchingAudio = mentionAudioMap.get(String(item?.name ?? item?.assetName ?? "").trim()) ?? null;
      return {
        id: `quick-ref:storyboard-image:${storyboard.id}:${item?.id ?? index + 1}`,
        assetId: item?.assetId ?? item?.id ?? `${storyboard.id}:ref:${index + 1}`,
        sourceStoryboardId: storyboard.id,
        kind: "image",
        name: `${resolveStoryboardReferenceLabel(storyboard)} 图片 ${index + 1}`,
        description,
        preview: item?.previewUrl ?? item?.preview ?? item?.url ?? null,
        url: item?.url ?? item?.previewUrl ?? item?.preview ?? null,
        voiceId: matchingAudio?.voiceId ?? null,
        voiceName: matchingAudio?.voiceName ?? "",
        voiceSource: matchingAudio?.voiceSource ?? null,
      };
    });
  }
  return [{
    id: `quick-ref:storyboard-image:${storyboard.id}:${image?.id ?? storyboard?.currentImageAssetVersionId ?? "preview"}`,
    assetId: storyboard.id,
    sourceStoryboardId: storyboard.id,
    kind: "image",
    name: `${resolveStoryboardReferenceLabel(storyboard)} 图片`,
    description,
    preview: resolvedPreviewImage,
    url: resolvedPreviewImage,
    voiceId: null,
    voiceName: "",
    voiceSource: null,
  }];
}

function appendStoryboardMentionAudioAttachments(workbench, description) {
  const nextAudioItems = buildStoryboardMentionAudioAttachments(workbench, description);
  if (!nextAudioItems.length) {
    return;
  }
  const currentAttachments = Array.isArray(workbench.ui.episodeWorkbenchAttachments)
    ? workbench.ui.episodeWorkbenchAttachments
    : [];
  const dedupedAttachments = [...currentAttachments];
  for (const item of nextAudioItems) {
    if (dedupedAttachments.some((current) => current?.id === item.id)) {
      continue;
    }
    dedupedAttachments.unshift(item);
  }
  workbench.ui.episodeWorkbenchAttachments = dedupedAttachments;
  const currentSelected = new Set(workbench.ui.episodeWorkbenchSelectedAttachmentIds ?? []);
  for (const item of nextAudioItems) {
    currentSelected.add(item.id);
  }
  workbench.ui.episodeWorkbenchSelectedAttachmentIds = [...currentSelected];
}

function syncStoryboardQuickReferencesToVideoGenerationState(workbench, storyboardId, references = []) {
  if (!storyboardId || !Array.isArray(references) || !references.length) {
    return;
  }
  const imageReferences = references.filter((item) => String(item?.kind ?? "") === "image" && item?.url);
  if (!imageReferences.length) {
    return;
  }
  updateStoryboardGenerationState(workbench, storyboardId, (state) => {
    const currentReferenceUploads = Array.isArray(state?.referenceUploads) ? state.referenceUploads : [];
    const firstImage = imageReferences[0];
    const additionalImages = imageReferences.slice(1).map((item, index) => ({
      id: item?.id ?? `quick-reference-upload-${index + 1}`,
      name: item?.name ?? `reference-${index + 1}`,
      kind: "image",
      type: "image",
      fromQuickReference: true,
      url: item.url,
      preview: item.preview ?? item.url,
      summary: item.description ?? "",
    }));
    const mergedReferenceUploads = [...currentReferenceUploads];
    for (const item of additionalImages) {
      if (mergedReferenceUploads.some((current) => current?.id === item.id || current?.url === item.url)) {
        continue;
      }
      mergedReferenceUploads.push(item);
    }
    return {
      ...state,
      firstFrame: state?.firstFrame ?? {
        id: firstImage.id ?? "quick-reference-first-frame",
        name: firstImage.name ?? "first-frame",
        kind: "image",
        type: "image",
        fromQuickReference: true,
        url: firstImage.url,
        preview: firstImage.preview ?? firstImage.url,
        summary: firstImage.description ?? "已从快捷引用带入首帧",
      },
      referenceUploads: mergedReferenceUploads,
      imageReference: state?.imageReference ?? {
        id: firstImage.id ?? "quick-reference-image-reference",
        name: firstImage.name ?? "image-reference",
        kind: "image",
        type: "image",
        fromQuickReference: true,
        url: firstImage.url,
        preview: firstImage.preview ?? firstImage.url,
        summary: firstImage.description ?? "已从快捷引用带入参考图",
      },
    };
  });
}

function resolveStoryboardReferenceLabel(storyboard) {
  const index = Number(storyboard?.index ?? 0);
  if (Number.isFinite(index) && index > 0) {
    return `分镜 ${index}`;
  }
  return storyboard?.displayTitle ?? storyboard?.title ?? "分镜";
}

export async function generateStoryboardImages(workbench) {
  await ensureGenerationReady(workbench, { mediaKind: "image" });
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
  await ensureGenerationReady(workbench, { mediaKind: "video" });
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
    generatedAudioItems: submission.generatedAudioItems ?? [],
  };
  if (workbench.ui.episodeMediaMode === "lip-sync") {
    workbench.ui.lipSyncAudioItems = submission.generatedAudioItems ?? [];
  }
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
      generatedAudioItems: result?.generatedAudioItems ?? result?.result?.generatedAudioItems ?? submission.generatedAudioItems ?? [],
    };
    if (workbench.ui.episodeMediaMode === "lip-sync") {
      workbench.ui.lipSyncAudioItems =
        result?.generatedAudioItems ?? result?.result?.generatedAudioItems ?? submission.generatedAudioItems ?? [];
    }
    if (isRealEpisodeWorkbench(workbench)) {
      applyEpisodeGenerationTaskResult(workbench, result, selectedStoryboard.id, "video");
    } else {
      await refresh(workbench);
    }
    render(workbench);
    if (shouldContinueGenerationPolling(workbench, selectedStoryboard.id, "video")) {
      scheduleGenerationPolling(workbench, selectedStoryboard.id, "video", { immediate: true });
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
  const isLipSync = isVideo && workbench.ui.episodeMediaMode === "lip-sync";
  const scopePrompt = String(getCurrentScopePrompt(workbench) ?? "");
  const generatedAudioItems = isLipSync && scopePrompt.trim()
    ? [{
        id: `lip-sync-audio-${Date.now()}`,
        type: "audio",
        kind: "audio",
        name: `音频 ${(workbench.ui.lipSyncAudioItems?.length ?? 0) + 1}`,
        summary: scopePrompt.trim().slice(0, 48),
        voiceName: workbench.ui.lipSyncVoiceName ?? "",
        audioUrl: buildEpisodeVoicePreviewDataUrl(
          `${workbench.ui.lipSyncVoiceName ?? ""}:${scopePrompt.trim().slice(0, 24)}`,
        ),
        status: "ready",
      }]
    : [];
  return {
    mediaKind,
    storyboardId: storyboard?.id ?? null,
    shotId: storyboard?.linkedShotId ?? null,
    promptPreview: scopePrompt || storyboard?.description || "",
    quickReferenceItems: [...(generationState.quickReferenceItems ?? [])],
    attachmentItems: [...(workbench.ui.episodeWorkbenchAttachments ?? [])],
    selectionContext: resolveEpisodeAssetSelectionContext(workbench),
    selectedModelId: resolveGenerationSubmissionModelCode(workbench, mediaKind),
    resolution: isVideo
      ? workbench.ui.videoResolution ?? workbench.state?.project?.resolution ?? "1080p"
      : workbench.ui.imageResolution ?? "2K",
    aspectRatio: isVideo
      ? workbench.state?.project?.aspectRatio ?? "9:16"
      : workbench.ui.imageAspectRatio ?? workbench.state?.project?.aspectRatio ?? "9:16",
    durationSec: isVideo ? Number(workbench.ui.videoDurationSec ?? 5) : null,
    creditCost: isLipSync ? calculateLipSyncCreditCost(scopePrompt) : isVideo ? 4500 : 4500,
    generatedAudioItems,
    createdAt: new Date().toISOString().slice(0, 19).replace("T", " "),
    status: "running",
  };
}

function resolveGenerationSubmissionModelCode(workbench, mediaKind) {
  if (mediaKind === "video") {
    return buildVideoGenerationPayload(workbench).model ?? workbench.ui.selectedModelId ?? null;
  }
  return buildImageGenerationPayload(workbench).model ?? workbench.ui.selectedModelId ?? null;
}

function createAssetGenerationSubmissionSnapshot(workbench, asset, assetKind, mediaKind = "image") {
  const selectionContext = resolveEpisodeAssetSelectionContext(workbench);
  const selectedModelId =
    mediaKind === "image"
      ? resolveConfiguredImageModelCode(
          workbench,
          workbench.ui.imageGenerationMode,
          workbench.ui.selectedModelId ?? "gpt-image-2-cn",
        )
      : (workbench.ui.selectedModelId ?? null);
  const scopePrompt = String(getCurrentScopePrompt(workbench) ?? "");
  return {
    mediaKind,
    assetId: asset?.id ?? null,
    promptPreview: scopePrompt || asset?.description || "",
    quickReferenceItems: [...(workbench.ui.assetPromptDraft?.quickReferenceItems ?? [])],
    attachmentItems: [...(workbench.ui.episodeWorkbenchAttachments ?? [])],
    selectionContext: {
      ...selectionContext,
      assetTab: assetKind,
      selectedAssetId: asset?.id ?? selectionContext.selectedAssetId,
      selectedAssetName: asset?.name ?? selectionContext.selectedAssetName,
      selectedAssetDescription: asset?.description ?? selectionContext.selectedAssetDescription,
      selectedAssetPreview:
        asset?.previewUrl ?? asset?.preview ?? asset?.sourceUrl ?? selectionContext.selectedAssetPreview,
    },
    selectedModelId,
    resolution: workbench.ui.imageResolution ?? "2K",
    aspectRatio: workbench.ui.imageAspectRatio ?? workbench.state?.project?.aspectRatio ?? "16:9",
    creditCost: mediaKind === "image" ? 50 : 90,
    createdAt: new Date().toISOString().slice(0, 19).replace("T", " "),
    status: "running",
  };
}

function buildAssetConversationHistoryKey(assetId, mediaKind = "image") {
  return `${mediaKind}:${assetId ?? ""}`;
}

function listAssetConversationHistoryEntries(workbench, assetId, mediaKind = "image") {
  const key = buildAssetConversationHistoryKey(assetId, mediaKind);
  const history = workbench.ui.assetConversationHistory ?? {};
  return Array.isArray(history[key]) ? history[key] : [];
}

function replaceAssetConversationHistoryEntries(workbench, assetId, entries, mediaKind = "image") {
  if (!assetId) {
    return [];
  }
  const key = buildAssetConversationHistoryKey(assetId, mediaKind);
  const nextEntries = Array.isArray(entries) ? entries.filter(Boolean) : [];
  workbench.ui.assetConversationHistory = {
    ...(workbench.ui.assetConversationHistory ?? {}),
    [key]: nextEntries,
  };
  return nextEntries;
}

function appendAssetConversationHistoryEntry(workbench, entry) {
  const mediaKind = entry?.mediaKind === "video" ? "video" : "image";
  const assetId = entry?.selectionContext?.selectedAssetId ?? entry?.assetId ?? null;
  if (!assetId) {
    return;
  }
  const key = buildAssetConversationHistoryKey(assetId, mediaKind);
  const current = listAssetConversationHistoryEntries(workbench, assetId, mediaKind);
  const taskId = String(entry?.taskId ?? "").trim();
  const nextEntries = taskId
    ? [...current.filter((item) => String(item?.taskId ?? "").trim() !== taskId), entry]
    : [...current, entry];
  workbench.ui.assetConversationHistory = {
    ...(workbench.ui.assetConversationHistory ?? {}),
    [key]: nextEntries,
  };
}

function resolveLatestAssetConversationResult(workbench, assetId, mediaKind = "image") {
  const history = listAssetConversationHistoryEntries(workbench, assetId, mediaKind);
  return history.at(-1) ?? null;
}

function resolveAssetConversationTargetKey(mediaKind = "image") {
  return mediaKind === "video" ? "videoGenerationResult" : "imageGenerationResult";
}

function resolveAssetConversationFallbackResult(workbench, assetId, mediaKind = "image") {
  if (mediaKind === "video") {
    return null;
  }
  return assetId && workbench.ui.episodeBatchResults?.[assetId]
    ? workbench.ui.episodeBatchResults[assetId]
    : null;
}

function syncSelectedAssetConversationResult(workbench, assetId, mediaKind = "image") {
  const targetKey = resolveAssetConversationTargetKey(mediaKind);
  workbench.ui[targetKey] =
    resolveLatestAssetConversationResult(workbench, assetId, mediaKind) ??
    resolveAssetConversationFallbackResult(workbench, assetId, mediaKind) ??
    null;
  return workbench.ui[targetKey];
}

function resolveStoryboardConversationMediaKind(workbench) {
  return workbench.ui.episodeMediaMode === "video" || workbench.ui.episodeMediaMode === "lip-sync"
    ? "video"
    : "image";
}

function buildStoryboardConversationHistoryKey(storyboardId, mediaKind = "image") {
  return `${mediaKind}:${storyboardId ?? ""}`;
}

function listStoryboardConversationHistoryEntries(workbench, storyboardId, mediaKind = "image") {
  const key = buildStoryboardConversationHistoryKey(storyboardId, mediaKind);
  const history = workbench.ui.storyboardConversationHistory ?? {};
  return Array.isArray(history[key]) ? history[key] : [];
}

function replaceStoryboardConversationHistoryEntries(workbench, storyboardId, entries, mediaKind = "image") {
  if (!storyboardId) {
    return [];
  }
  const key = buildStoryboardConversationHistoryKey(storyboardId, mediaKind);
  const nextEntries = Array.isArray(entries) ? entries.filter(Boolean) : [];
  workbench.ui.storyboardConversationHistory = {
    ...(workbench.ui.storyboardConversationHistory ?? {}),
    [key]: nextEntries,
  };
  return nextEntries;
}

function appendStoryboardConversationHistoryEntry(workbench, entry) {
  const mediaKind = entry?.mediaKind === "video" ? "video" : "image";
  const storyboardId = entry?.storyboardId ?? entry?.selectionContext?.selectedStoryboardId ?? null;
  if (!storyboardId) {
    return;
  }
  const current = listStoryboardConversationHistoryEntries(workbench, storyboardId, mediaKind);
  const taskId = resolveGenerationTaskIdForConversation(entry);
  const nextEntries = taskId
    ? [...current.filter((item) => resolveGenerationTaskIdForConversation(item) !== taskId), entry]
    : [...current, entry];
  replaceStoryboardConversationHistoryEntries(workbench, storyboardId, nextEntries, mediaKind);
}

function resolveGenerationTaskIdForConversation(entry) {
  return String(
    entry?.taskId ??
      entry?.platform?.tasks?.[0]?.taskId ??
      entry?.id ??
      "",
  ).trim();
}

function resolveStoryboardConversationApiId(workbench, storyboardId) {
  const normalized = String(storyboardId ?? "").trim();
  const storyboard = getActiveStoryboards(workbench).find((item) => item.id === normalized) ?? null;
  const linkedShotId = String(storyboard?.linkedShotId ?? storyboard?.shotId ?? "").trim();
  if (isUuidLike(linkedShotId)) {
    return linkedShotId;
  }
  if (normalized.startsWith("storyboard-") && isUuidLike(normalized.slice("storyboard-".length))) {
    return normalized.slice("storyboard-".length);
  }
  return normalized;
}

function resolveLatestStoryboardConversationResult(workbench, storyboardId, mediaKind = "image") {
  const history = listStoryboardConversationHistoryEntries(workbench, storyboardId, mediaKind);
  return history.at(-1) ?? null;
}

function syncSelectedStoryboardConversationResult(workbench, storyboardId, mediaKind = "image") {
  const targetKey = resolveAssetConversationTargetKey(mediaKind);
  workbench.ui[targetKey] = resolveLatestStoryboardConversationResult(workbench, storyboardId, mediaKind);
  return workbench.ui[targetKey];
}

function removeStoryboardConversationHistoryEntry(workbench, storyboardId, taskId, mediaKind = "image") {
  if (!storyboardId || !String(taskId ?? "").trim()) {
    return listStoryboardConversationHistoryEntries(workbench, storyboardId, mediaKind);
  }
  const key = buildStoryboardConversationHistoryKey(storyboardId, mediaKind);
  const current = listStoryboardConversationHistoryEntries(workbench, storyboardId, mediaKind);
  const nextEntries = current.filter((item) => resolveGenerationTaskIdForConversation(item) !== String(taskId).trim());
  workbench.ui.storyboardConversationHistory = {
    ...(workbench.ui.storyboardConversationHistory ?? {}),
    [key]: nextEntries,
  };
  syncSelectedStoryboardConversationResult(workbench, storyboardId, mediaKind);
  return nextEntries;
}

function applyStoryboardConversationHistoryAfterDelete(
  workbench,
  storyboardId,
  taskId,
  mediaKind = "image",
  nextEntries = null,
) {
  const remainingHistory = Array.isArray(nextEntries)
    ? replaceStoryboardConversationHistoryEntries(workbench, storyboardId, nextEntries, mediaKind)
    : removeStoryboardConversationHistoryEntry(workbench, storyboardId, taskId, mediaKind);
  const latestRemaining = remainingHistory.at(-1) ?? null;
  const targetKey = resolveAssetConversationTargetKey(mediaKind);
  workbench.ui[targetKey] = latestRemaining;
  return remainingHistory;
}

async function deleteStoryboardConversationTurn(workbench, storyboardId, taskId, mediaKind = "image") {
  if (!storyboardId || !String(taskId ?? "").trim()) {
    workbench.ui.toast = "当前没有可删除的对话。";
    renderEpisodeWorkbenchStageBodyOnly(workbench);
    return;
  }
  try {
    let nextEntries = null;
    if (
      isRealEpisodeWorkbench(workbench) &&
      typeof workbench.api?.deleteStoryboardConversationTurn === "function"
    ) {
      const response = await workbench.api.deleteStoryboardConversationTurn(
        workbench.ui.selectedEpisodeId,
        resolveStoryboardConversationApiId(workbench, storyboardId),
        taskId,
        mediaKind,
      );
      nextEntries = Array.isArray(response?.entries) ? response.entries : null;
    }
    applyStoryboardConversationHistoryAfterDelete(workbench, storyboardId, taskId, mediaKind, nextEntries);
    workbench.ui.toast = "已删除当前这一次对话。";
    renderEpisodeWorkbenchStageBodyOnly(workbench);
  } catch (error) {
    workbench.ui.toast = `删除失败：${friendlyError(error)}`;
    renderEpisodeWorkbenchStageBodyOnly(workbench);
  }
}

function resolveStoryboardConversationActionResult(workbench, taskId, mediaKind = "image", storyboardId = null) {
  const targetStoryboardId = storyboardId ?? workbench.ui.selectedStoryboardId ?? null;
  const history = listStoryboardConversationHistoryEntries(workbench, targetStoryboardId, mediaKind);
  const normalizedTaskId = String(taskId ?? "").trim();
  if (!normalizedTaskId) {
    return history.at(-1) ?? null;
  }
  const scopedResult = history.find((item) => resolveGenerationTaskIdForConversation(item) === normalizedTaskId) ?? null;
  if (scopedResult) {
    return scopedResult;
  }
  const allHistory = Object.values(workbench.ui.storyboardConversationHistory ?? {})
    .flatMap((items) => Array.isArray(items) ? items : []);
  return allHistory.find((item) => resolveGenerationTaskIdForConversation(item) === normalizedTaskId) ?? null;
}

function resolveStoryboardResultPrompt(result) {
  return String(result?.promptPreview ?? result?.generationState?.lastSubmission?.promptPreview ?? "").trim();
}

function applyStoryboardResultPrompt(workbench, storyboardId, prompt) {
  const nextDescription = String(prompt ?? "").trim();
  if (!storyboardId || !nextDescription) {
    return;
  }
  updateStoryboardById(workbench, storyboardId, (currentStoryboard) => ({
    ...currentStoryboard,
    description: nextDescription,
  }));
}

function normalizeConversationDraftAttachment(item, index, kind) {
  const mediaKind = kind === "audio" ? "audio" : "image";
  const id =
    item?.id ??
    item?.assetId ??
    item?.fileId ??
    item?.storageObjectId ??
    item?.url ??
    item?.src ??
    item?.audioUrl ??
    `conversation-${mediaKind}-${index + 1}`;
  return {
    ...item,
    id: `edit-${mediaKind}:${id}`,
    type: mediaKind,
    kind: mediaKind,
    name: item?.name ?? item?.label ?? (mediaKind === "audio" ? `音频 ${index + 1}` : `图片 ${index + 1}`),
    preview: item?.preview ?? item?.previewUrl ?? item?.src ?? item?.url ?? null,
    previewUrl: item?.previewUrl ?? item?.preview ?? item?.src ?? item?.url ?? null,
    url: item?.url ?? item?.src ?? item?.previewUrl ?? item?.preview ?? null,
    audioUrl: item?.audioUrl ?? item?.url ?? item?.src ?? null,
  };
}

function extractConversationEditAudioItems(result) {
  return [
    ...(Array.isArray(result?.attachmentItems) ? result.attachmentItems : []),
    ...(Array.isArray(result?.generatedAudioItems) ? result.generatedAudioItems : []),
    ...(Array.isArray(result?.result?.generatedAudioItems) ? result.result.generatedAudioItems : []),
  ]
    .filter((item) => String(item?.type ?? item?.kind ?? "") === "audio")
    .map((item, index) => normalizeConversationDraftAttachment(item, index, "audio"));
}

function extractConversationEditImageItems(result) {
  const attachmentImages = (Array.isArray(result?.attachmentItems) ? result.attachmentItems : [])
    .filter((item) => String(item?.type ?? item?.kind ?? "") !== "audio");
  const quickReferences = Array.isArray(result?.quickReferenceItems) ? result.quickReferenceItems : [];
  const fixedImages = Array.isArray(result?.fixedImages) ? result.fixedImages : [];
  return [...quickReferences, ...attachmentImages, ...fixedImages]
    .filter((item) => item?.preview || item?.previewUrl || item?.url || item?.src)
    .map((item, index) => normalizeConversationDraftAttachment(item, index, "image"));
}

function applyStoryboardConversationEditDraft(workbench, result, selectedStoryboard = null) {
  if (!result) {
    return;
  }
  const storyboardId = selectedStoryboard?.id ?? workbench.ui.selectedStoryboardId ?? null;
  const prompt = String(result?.promptPreview ?? selectedStoryboard?.description ?? "").trim();
  setCurrentScopePrompt(workbench, prompt);
  const audioItems = extractConversationEditAudioItems(result);
  const imageItems = dedupeQuickReferenceItems(extractConversationEditImageItems(result));
  workbench.ui.episodeWorkbenchAttachments = audioItems;
  workbench.ui.episodeWorkbenchSelectedAttachmentIds = audioItems.map((item) => item.id).filter(Boolean);
  if (storyboardId) {
    updateStoryboardGenerationState(workbench, storyboardId, (generationState) => ({
      ...generationState,
      prompt,
      quickReferenceItems: imageItems,
    }));
  }
}

function buildStoryboardConversationPayload(entry, messageType) {
  return {
    ...buildAssetConversationPayload(entry, messageType),
    assetId: entry?.storyboardId ?? entry?.selectionContext?.selectedStoryboardId ?? null,
    storyboardId: entry?.storyboardId ?? entry?.selectionContext?.selectedStoryboardId ?? null,
  };
}

function buildStoryboardConversationMessages(entry, { includeUserRequest = false } = {}) {
  return buildAssetConversationMessages(entry, { includeUserRequest }).map((message) => ({
    ...message,
    payload: buildStoryboardConversationPayload(entry, message.messageType),
  }));
}

async function persistStoryboardConversationEntry(workbench, entry, { includeUserRequest = false } = {}) {
  const mediaKind = entry?.mediaKind === "video" ? "video" : "image";
  const storyboardId = entry?.storyboardId ?? entry?.selectionContext?.selectedStoryboardId ?? null;
  if (
    !storyboardId ||
    !isRealEpisodeWorkbench(workbench) ||
    typeof workbench.api?.saveStoryboardConversationMessages !== "function"
  ) {
    return null;
  }
  const response = await workbench.api.saveStoryboardConversationMessages(
    workbench.ui.selectedEpisodeId,
    resolveStoryboardConversationApiId(workbench, storyboardId),
    {
      mediaMode: mediaKind,
      messages: buildStoryboardConversationMessages(entry, { includeUserRequest }),
    },
  );
  const entries = Array.isArray(response?.entries) ? response.entries : [];
  replaceStoryboardConversationHistoryEntries(workbench, storyboardId, entries, mediaKind);
  if (workbench.ui.selectedStoryboardId === storyboardId) {
    syncSelectedStoryboardConversationResult(workbench, storyboardId, mediaKind);
  }
  return response;
}

async function loadSelectedStoryboardConversationHistory(workbench, options = {}) {
  const mediaKind = options.mediaKind === "video" ? "video" : "image";
  const storyboardId = options.storyboardId ?? workbench.ui.selectedStoryboardId ?? null;
  const targetKey = resolveAssetConversationTargetKey(mediaKind);
  if (!storyboardId) {
    workbench.ui[targetKey] = null;
    return [];
  }
  if (
    !isRealEpisodeWorkbench(workbench) ||
    typeof workbench.api?.getStoryboardConversationHistory !== "function"
  ) {
    syncSelectedStoryboardConversationResult(workbench, storyboardId, mediaKind);
    return listStoryboardConversationHistoryEntries(workbench, storyboardId, mediaKind);
  }
  try {
    const response = await workbench.api.getStoryboardConversationHistory(
      workbench.ui.selectedEpisodeId,
      resolveStoryboardConversationApiId(workbench, storyboardId),
      mediaKind,
    );
    const entries = Array.isArray(response?.entries) ? response.entries : [];
    replaceStoryboardConversationHistoryEntries(workbench, storyboardId, entries, mediaKind);
    syncSelectedStoryboardConversationResult(workbench, storyboardId, mediaKind);
    return entries;
  } catch {
    syncSelectedStoryboardConversationResult(workbench, storyboardId, mediaKind);
    return listStoryboardConversationHistoryEntries(workbench, storyboardId, mediaKind);
  }
}

function buildAssetConversationPayload(entry, messageType) {
  const mediaKind = entry?.mediaKind === "video" ? "video" : "image";
  const assetId = entry?.selectionContext?.selectedAssetId ?? entry?.assetId ?? null;
  const payload = {
    assetId,
    mediaKind,
    promptPreview: entry?.promptPreview ?? "",
    quickReferenceItems: Array.isArray(entry?.quickReferenceItems) ? entry.quickReferenceItems : [],
    attachmentItems: Array.isArray(entry?.attachmentItems) ? entry.attachmentItems : [],
    generatedAudioItems: Array.isArray(entry?.generatedAudioItems)
      ? entry.generatedAudioItems
      : Array.isArray(entry?.result?.generatedAudioItems)
        ? entry.result.generatedAudioItems
        : [],
    selectionContext:
      entry?.selectionContext && typeof entry.selectionContext === "object"
        ? entry.selectionContext
        : {},
    selectedModelId: entry?.selectedModelId ?? null,
    aspectRatio: entry?.aspectRatio ?? null,
    resolution: entry?.resolution ?? null,
    creditCost: entry?.creditCost ?? null,
    createdAt: entry?.createdAt ?? null,
    taskId: entry?.taskId ?? null,
    status: entry?.status ?? null,
    failureCode: entry?.failureCode ?? entry?.failure?.failureCode ?? null,
    failure:
      entry?.failure && typeof entry.failure === "object"
        ? entry.failure
        : null,
    noticeType: entry?.noticeType ?? entry?.failure?.noticeType ?? null,
  };
  if (messageType !== "user_request") {
    payload.fixedImages = normalizeGeneratedConversationImages(entry?.fixedImages);
    payload.fixedVideos = Array.isArray(entry?.fixedVideos) ? entry.fixedVideos : [];
  }
  return payload;
}

function resolveAssetConversationTurnId(entry) {
  const taskId = String(entry?.taskId ?? "").trim();
  if (taskId) {
    return taskId;
  }
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `asset-conversation-${globalThis.crypto.randomUUID()}`;
  }
  return `asset-conversation-${Date.now()}`;
}

function normalizeGeneratedConversationImages(images) {
  if (!Array.isArray(images)) {
    return [];
  }
  return images.map((image) => {
    if (!image || typeof image !== "object") {
      return image;
    }
    const storageObjectId = String(image.storageObjectId ?? "").trim() || null;
    const url =
      String(image.url ?? "").trim() ||
      String(image.previewUrl ?? "").trim() ||
      String(image.src ?? "").trim() ||
      null;
    return {
      ...image,
      id: storageObjectId ?? url ?? image.id ?? null,
      assetVersionId: null,
    };
  });
}

function buildAssetConversationMessages(entry, { includeUserRequest = false } = {}) {
  const turnId = resolveAssetConversationTurnId(entry);
  const status = String(entry?.status ?? "running").trim().toLowerCase() || "running";
  const taskId = String(entry?.taskId ?? "").trim() || null;
  const messages = [];
  if (includeUserRequest) {
    messages.push({
      turnId,
      messageKey: `${turnId}:user_request`,
      messageType: "user_request",
      payload: buildAssetConversationPayload(entry, "user_request"),
    });
  }
  messages.push({
    turnId,
    messageKey: `${turnId}:task_status`,
    messageType: "task_status",
    taskId,
    status,
    payload: buildAssetConversationPayload(entry, "task_status"),
  });
  messages.push({
    turnId,
    messageKey: `${turnId}:result`,
    messageType: "result",
    taskId,
    status,
    payload: buildAssetConversationPayload(entry, "result"),
  });
  return messages;
}

async function persistAssetConversationEntry(workbench, entry, { includeUserRequest = false } = {}) {
  const mediaKind = entry?.mediaKind === "video" ? "video" : "image";
  const assetId = entry?.selectionContext?.selectedAssetId ?? entry?.assetId ?? null;
  if (
    !assetId ||
    !isRealEpisodeWorkbench(workbench) ||
    typeof workbench.api?.saveAssetConversationMessages !== "function"
  ) {
    return null;
  }
  const response = await workbench.api.saveAssetConversationMessages(
    workbench.ui.selectedEpisodeId,
    assetId,
    {
      mediaMode: mediaKind,
      messages: buildAssetConversationMessages(entry, { includeUserRequest }),
    },
  );
  const entries = Array.isArray(response?.entries) ? response.entries : [];
  replaceAssetConversationHistoryEntries(workbench, assetId, entries, mediaKind);
  const selectedAssetId = workbench.ui.selectedEpisodeAssetId ?? workbench.ui.selectedEpisodeCardId ?? null;
  if (selectedAssetId === assetId) {
    syncSelectedAssetConversationResult(workbench, assetId, mediaKind);
  }
  return response;
}

export async function loadSelectedAssetConversationHistory(workbench, options = {}) {
  const mediaKind = options.mediaKind === "video" ? "video" : "image";
  const assetId =
    options.assetId ??
    workbench.ui.selectedEpisodeAssetId ??
    workbench.ui.selectedEpisodeCardId ??
    null;
  const targetKey = resolveAssetConversationTargetKey(mediaKind);
  if (!assetId) {
    workbench.ui[targetKey] = null;
    return [];
  }
  if (
    !isRealEpisodeWorkbench(workbench) ||
    typeof workbench.api?.getAssetConversationHistory !== "function"
  ) {
    syncSelectedAssetConversationResult(workbench, assetId, mediaKind);
    return listAssetConversationHistoryEntries(workbench, assetId, mediaKind);
  }
  try {
    const response = await workbench.api.getAssetConversationHistory(
      workbench.ui.selectedEpisodeId,
      assetId,
      mediaKind,
    );
    const entries = Array.isArray(response?.entries) ? response.entries : [];
    replaceAssetConversationHistoryEntries(workbench, assetId, entries, mediaKind);
    syncSelectedAssetConversationResult(workbench, assetId, mediaKind);
    return entries;
  } catch {
    syncSelectedAssetConversationResult(workbench, assetId, mediaKind);
    return listAssetConversationHistoryEntries(workbench, assetId, mediaKind);
  }
}

function resolveAssetConversationActionResult(workbench, taskId, mediaKind = "image") {
  const normalizedTaskId = String(taskId ?? "").trim();
  if (!normalizedTaskId) {
    return mediaKind === "video" ? workbench.ui.videoGenerationResult ?? null : workbench.ui.imageGenerationResult ?? null;
  }
  const assetId = workbench.ui.selectedEpisodeAssetId ?? workbench.ui.selectedEpisodeCardId ?? null;
  const history = listAssetConversationHistoryEntries(workbench, assetId, mediaKind);
  return history.find((item) => String(item?.taskId ?? "").trim() === normalizedTaskId) ?? null;
}

function removeAssetConversationHistoryEntry(workbench, assetId, taskId, mediaKind = "image") {
  if (!assetId || !String(taskId ?? "").trim()) {
    return listAssetConversationHistoryEntries(workbench, assetId, mediaKind);
  }
  const key = buildAssetConversationHistoryKey(assetId, mediaKind);
  const current = listAssetConversationHistoryEntries(workbench, assetId, mediaKind);
  const nextEntries = current.filter((item) => String(item?.taskId ?? "").trim() !== String(taskId).trim());
  workbench.ui.assetConversationHistory = {
    ...(workbench.ui.assetConversationHistory ?? {}),
    [key]: nextEntries,
  };
  return nextEntries;
}

function applyAssetConversationHistoryAfterDelete(
  workbench,
  assetId,
  taskId,
  mediaKind = "image",
  nextEntries = null,
) {
  const remainingHistory = Array.isArray(nextEntries)
    ? replaceAssetConversationHistoryEntries(workbench, assetId, nextEntries, mediaKind)
    : removeAssetConversationHistoryEntry(workbench, assetId, taskId, mediaKind);
  const latestRemaining = remainingHistory.at(-1) ?? null;
  const nextBatchResults = { ...(workbench.ui.episodeBatchResults ?? {}) };
  if (assetId) {
    if (latestRemaining) {
      nextBatchResults[assetId] = latestRemaining;
    } else {
      delete nextBatchResults[assetId];
    }
  }
  workbench.ui.episodeBatchResults = nextBatchResults;
  if (mediaKind === "video") {
    workbench.ui.videoGenerationResult = latestRemaining;
  } else {
    workbench.ui.imageGenerationResult = latestRemaining;
  }
  return remainingHistory;
}

function resolveEpisodeAssetKindLabel(assetKind = "character") {
  if (assetKind === "scene") {
    return "场景";
  }
  if (assetKind === "prop") {
    return "道具";
  }
  return "角色";
}

function inferEpisodeAssetKind(name = "") {
  const value = String(name ?? "");
  if (/[街路营地场景夜景废墟]/.test(value)) {
    return "scene";
  }
  if (/[车器刀枪道具]/.test(value)) {
    return "prop";
  }
  return "character";
}

function buildEpisodeBatchModal(workbench, { scope = "asset", mode = "image", items = [] } = {}) {
  const imageResolution = String(workbench.ui.imageResolution ?? "2K").toUpperCase();
  const aspectRatio = workbench.ui.imageAspectRatio ?? workbench.state?.project?.aspectRatio ?? "16:9";
  const nextModal = {
    show: true,
    scope,
    mode,
    items,
    openField: null,
    imageModelId: "tnb-pro",
    styleTab: "public",
    selectedStyleId: "public-1",
    scenePresetId: "scene-wide",
    rolePresetId: "character-triple",
    propPresetId: "prop-triple",
    aspectRatio,
    size: ["1K", "2K"].includes(imageResolution) ? imageResolution : "2K",
    videoModelId: workbench.ui.selectedModelId ?? "vidu-q3-pro",
    videoDurationSec: String(workbench.ui.videoDurationSec ?? "10"),
    videoResolution: String(workbench.ui.videoResolution ?? "720P").toUpperCase(),
  };
  return syncEpisodeBatchModal(nextModal);
}

function syncEpisodeBatchModal(modal) {
  return {
    ...modal,
    totalCredits: resolveEpisodeBatchTotalCredits(modal),
  };
}

function resolveEpisodeBatchTotalCredits(modal) {
  const count = Array.isArray(modal?.items) ? modal.items.length : 0;
  return count * resolveEpisodeBatchUnitCredit(modal);
}

function resolveEpisodeBatchUnitCredit(modal) {
  const mode = modal?.mode ?? "image";
  if (mode === "video") {
    return modal?.videoResolution === "1080P" ? 3600 : 2800;
  }
  if (mode === "upscale") {
    return 30;
  }
  const modelId = modal?.imageModelId ?? "tnb-pro";
  const size = String(modal?.size ?? "2K").toUpperCase();
  if (modelId === "jimeng-4-5" || modelId === "jimeng-4-5-vip") {
    return size === "1K" ? 40 : 50;
  }
  if (modelId === "tnb-fast") {
    return size === "1K" ? 60 : 70;
  }
  if (modelId === "tnb-ultra") {
    return size === "1K" ? 110 : 120;
  }
  return size === "1K" ? 80 : 90;
}

export async function generateAssetImages(workbench) {
  const selectionContext = resolveEpisodeAssetSelectionContext(workbench);
  const asset = selectionContext.selectedAsset;
  const assetKind = selectionContext.assetTab ?? workbench.ui.projectAssetTab ?? "character";
  if (!asset?.id) {
    workbench.ui.validationMessage = "请先创建或选中资产后再生成。";
    workbench.ui.toast = "请先创建或选中资产后再生成。";
    render(workbench);
    return;
  }
  if (!String(getCurrentScopePrompt(workbench) ?? "").trim()) {
    workbench.ui.validationMessage = "请输入内容";
    workbench.ui.toast = "请输入内容";
    render(workbench);
    return;
  }

  const submission = createAssetGenerationSubmissionSnapshot(workbench, asset, assetKind, "image");
  if (typeof workbench.api?.createImageTask === "function") {
    stopGenerationPolling(workbench);
    workbench.ui.generationPollingActive = true;
    workbench.ui.imageGenerationResult = {
      ...(workbench.ui.imageGenerationResult ?? {}),
      ...submission,
      status: "running",
      quickReferenceItems: submission.quickReferenceItems,
      attachmentItems: submission.attachmentItems,
      selectionContext: submission.selectionContext,
    };
    render(workbench);

    const payload = buildImageGenerationPayload(workbench);
    collectEpisodeWorkbenchEvent(workbench, "generation.submit", {
      mediaKind: "image",
      payload: {
        ...payload,
        targetType: "asset",
        targetId: asset.id,
        assetId: asset.id,
        assetType: assetKind,
        prompt: submission.promptPreview,
      },
      submission,
    });
    const result = normalizeEpisodeTaskForLegacyResult(
      await workbench.api.createImageTask(workbench.ui.selectedEpisodeId, {
        ...payload,
        targetType: "asset",
        targetId: asset.id,
        assetId: asset.id,
        assetType: assetKind,
        prompt: submission.promptPreview,
      }),
      submission,
      "image",
    );
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
    appendAssetConversationHistoryEntry(workbench, workbench.ui.imageGenerationResult);
    workbench.ui.episodeBatchResults = {
      ...(workbench.ui.episodeBatchResults ?? {}),
      [asset.id]: workbench.ui.imageGenerationResult,
    };
    setCurrentScopePrompt(workbench, "");
    workbench.ui.assetPromptDraft = {
      ...(workbench.ui.assetPromptDraft ?? {}),
      scopeMode: "assets",
      prompt: "",
      quickReferenceItems: [],
      mentionReferences: [],
    };
    workbench.ui.episodeWorkbenchConversationScrollMode = "latest";
    if (Number.isFinite(Number(result?.creditBalance))) {
      workbench.ui.creditBalance = Number(result.creditBalance);
    }
    if (isGenerationTaskTerminalStatus(resolveWorkflowStatus(workbench.ui.imageGenerationResult.status))) {
      workbench.ui.generationPollingActive = false;
    } else {
      scheduleSelectedAssetGenerationPolling(workbench, "image", { immediate: true });
    }
    render(workbench);
    try {
      await persistAssetConversationEntry(workbench, workbench.ui.imageGenerationResult, { includeUserRequest: true });
      render(workbench);
    } catch {
      // Keep the generated result visible if conversation persistence is temporarily unavailable.
    }
    return;
  }

  workbench.ui.validationMessage = "真实图片生成接口不可用，请刷新后重试。";
  workbench.ui.toast = "真实图片生成接口不可用，请刷新后重试。";
  render(workbench);
  throw new Error("episode_image_generation_api_missing");
}

function validateLipSyncGeneration(workbench) {
  const text = String(getCurrentScopePrompt(workbench) ?? "").trim();
  if (!text) {
    return { ok: false, message: "请输入配音内容后再生成。" };
  }
  if (!String(workbench.ui.lipSyncVoiceName ?? "").trim()) {
    return { ok: false, message: "请先选择配音员后再生成。" };
  }
  return { ok: true };
}

function calculateLipSyncCreditCost(value) {
  const length = [...String(value ?? "").trim()].length;
  if (!length) {
    return 0;
  }
  return Math.ceil(length / 10) * 2;
}

function playEpisodeVoicePreview(workbench, voiceName) {
  stopEpisodeVoicePreview(workbench);
  if (typeof Audio === "undefined") {
    return;
  }
  const audio = new Audio(buildEpisodeVoicePreviewDataUrl(voiceName));
  audio.volume = 0.45;
  audio.onended = () => {
    if (workbench.ui.episodeVoiceModal) {
      workbench.ui.episodeVoiceModal = {
        ...workbench.ui.episodeVoiceModal,
        previewVoiceName: "",
      };
      render(workbench);
    }
  };
  workbench.voicePreviewAudio = audio;
  void audio.play().catch(() => {});
}

function stopEpisodeVoicePreview(workbench) {
  if (workbench.voicePreviewAudio) {
    try {
      workbench.voicePreviewAudio.pause();
      workbench.voicePreviewAudio.currentTime = 0;
    } catch {}
    workbench.voicePreviewAudio = null;
  }
}

function playLipSyncAudioPreview(workbench, item) {
  stopLipSyncAudioPreview(workbench);
  if (typeof Audio === "undefined") {
    return;
  }
  const seed = `${item?.voiceName ?? ""}:${item?.summary ?? item?.name ?? ""}`;
  const audio = new Audio(item?.audioUrl ?? buildEpisodeVoicePreviewDataUrl(seed));
  audio.volume = 0.5;
  audio.onended = () => {
    workbench.ui.lipSyncPreviewAudioId = null;
    workbench.lipSyncPreviewAudio = null;
    render(workbench);
  };
  workbench.ui.lipSyncPreviewAudioId = item?.id ?? null;
  workbench.lipSyncPreviewAudio = audio;
  void audio.play().catch(() => {
    workbench.ui.lipSyncPreviewAudioId = null;
    workbench.lipSyncPreviewAudio = null;
    render(workbench);
  });
}

function stopLipSyncAudioPreview(workbench) {
  if (workbench.lipSyncPreviewAudio) {
    try {
      workbench.lipSyncPreviewAudio.pause();
      workbench.lipSyncPreviewAudio.currentTime = 0;
    } catch {}
    workbench.lipSyncPreviewAudio = null;
  }
  workbench.ui.lipSyncPreviewAudioId = null;
}

function buildEpisodeVoicePreviewDataUrl(voiceName) {
  const seed = [...String(voiceName ?? "")].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const sampleRate = 8000;
  const durationSec = 0.45;
  const samples = Math.floor(sampleRate * durationSec);
  const frequency = 300 + (seed % 220);
  const pcmBytes = new Uint8Array(samples);
  for (let index = 0; index < samples; index += 1) {
    const envelope = Math.min(1, index / 600) * Math.min(1, (samples - index) / 600);
    const sample = Math.sin((2 * Math.PI * frequency * index) / sampleRate) * 0.5 * envelope;
    pcmBytes[index] = Math.max(0, Math.min(255, Math.round(128 + sample * 127)));
  }
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const writeString = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + pcmBytes.length, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  writeString(36, "data");
  view.setUint32(40, pcmBytes.length, true);
  const wavBytes = new Uint8Array(header.byteLength + pcmBytes.length);
  wavBytes.set(new Uint8Array(header), 0);
  wavBytes.set(pcmBytes, header.byteLength);
  let binary = "";
  for (const byte of wavBytes) {
    binary += String.fromCharCode(byte);
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

async function persistLipSyncStoryboardDraft(workbench, options = {}) {
  if (!isRealEpisodeWorkbench(workbench) || typeof workbench.api.saveDraft !== "function") {
    return null;
  }
  const selectedStoryboard = getSelectedStoryboard(
    getActiveStoryboards(workbench),
    workbench.ui.selectedStoryboardId,
  );
  const targetId = selectedStoryboard?.linkedShotId ?? selectedStoryboard?.id ?? null;
  if (!targetId) {
    return null;
  }
  const text = String(workbench.ui.prompt ?? "");
  const payload = {
    prompt: text,
    mode: "lip_sync",
    payload: {
      text,
      textLength: [...text.trim()].length,
      voiceId: workbench.ui.lipSyncVoiceId ?? null,
      voiceName: workbench.ui.lipSyncVoiceName ?? "",
      voiceSource: workbench.ui.lipSyncVoiceSource ?? null,
      estimatedCreditCost: calculateLipSyncCreditCost(text),
    },
  };
  try {
    return await workbench.api.saveDraft(workbench.ui.selectedEpisodeId, "storyboard", targetId, payload);
  } catch (error) {
    if (!options?.silent) {
      workbench.ui.toast = `保存对口型草稿失败：${friendlyError(error)}`;
      render(workbench);
    }
    return null;
  }
}

const GENERATION_POLL_INTERVAL_MS = 25000;

function scheduleGenerationPolling(workbench, storyboardId, mediaKind, options = {}) {
  stopGenerationPolling(workbench);
  workbench.generationPollStartedAt = workbench.generationPollStartedAt ?? Date.now();
  const delayMs = options.immediate ? 0 : GENERATION_POLL_INTERVAL_MS;
  workbench.generationPollTimer = window.setTimeout(async () => {
    workbench.generationPollTimer = null;
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
        if (isGenerationTaskTerminalStatus(resolveWorkflowStatus(latestTask?.status))) {
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
  }, delayMs);
}

function scheduleSelectedAssetGenerationPolling(workbench, mediaKind = "image", options = {}) {
  if (typeof window === "undefined" || typeof window.setTimeout !== "function") {
    return;
  }
  const target = resolveSelectedAssetGenerationPollTarget(workbench, mediaKind);
  if (!target) {
    stopAssetGenerationPolling(workbench);
    return;
  }
  if (workbench.assetGenerationPollTimer && workbench.assetGenerationPollScopeKey === target.scopeKey) {
    return;
  }

  stopAssetGenerationPolling(workbench);
  workbench.assetGenerationPollScopeKey = target.scopeKey;
  const delayMs = options.immediate ? 0 : GENERATION_POLL_INTERVAL_MS;
  workbench.assetGenerationPollTimer = window.setTimeout(async () => {
    workbench.assetGenerationPollTimer = null;
    try {
      const latestTask = await workbench.api.getGenerationTask(target.taskId);
      applyEpisodeGenerationTaskResult(workbench, latestTask, "", target.mediaKind);
      const latestStatus = resolveWorkflowStatus(latestTask?.status);
      if (isGenerationTaskTerminalStatus(latestStatus)) {
        stopAssetGenerationPolling(workbench);
        workbench.ui.generationPollingActive = false;
        render(workbench);
        return;
      }
      render(workbench);
      scheduleSelectedAssetGenerationPolling(workbench, target.mediaKind);
    } catch (error) {
      stopAssetGenerationPolling(workbench);
      workbench.ui.toast = `轮询刷新失败：${friendlyError(error)}`;
      render(workbench);
    }
  }, delayMs);
}

function stopAssetGenerationPolling(workbench) {
  if (workbench.assetGenerationPollTimer) {
    if (typeof window !== "undefined" && typeof window.clearTimeout === "function") {
      window.clearTimeout(workbench.assetGenerationPollTimer);
    }
    workbench.assetGenerationPollTimer = null;
  }
  workbench.assetGenerationPollScopeKey = null;
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
  const targetKey = mediaKind === "video" ? "videoGenerationResult" : "imageGenerationResult";
  const currentStatus = resolveWorkflowStatus(
    workbench.ui[targetKey]?.status ??
      workbench.ui[targetKey]?.platform?.workflowStatus,
  );
  if (isGenerationTaskTerminalStatus(currentStatus) && currentStatus !== "completed") {
    render(workbench);
    return;
  }
  updateStoryboardGenerationState(workbench, storyboardId, (generationState) => ({
    ...generationState,
    lastSubmission: generationState.lastSubmission
      ? { ...generationState.lastSubmission, status: "completed" }
      : generationState.lastSubmission,
  }));
  if (workbench.ui[targetKey]) {
    workbench.ui[targetKey] = {
      ...workbench.ui[targetKey],
      status: "completed",
    };
  }
  render(workbench);
}

function resolveSelectedAssetGenerationPollTarget(workbench, mediaKind = "image") {
  if (
    workbench.ui.projectPanelMode !== "episode-workbench" ||
    (workbench.ui.museScopeMode ?? "storyboard") !== "assets" ||
    typeof workbench.api?.getGenerationTask !== "function"
  ) {
    return null;
  }
  const assetId = workbench.ui.selectedEpisodeAssetId ?? workbench.ui.selectedEpisodeCardId ?? null;
  if (!assetId) {
    return null;
  }
  const entries = listAssetConversationHistoryEntries(workbench, assetId, mediaKind);
  const candidates = [
    ...(Array.isArray(entries) ? entries : []),
    mediaKind === "video" ? workbench.ui.videoGenerationResult : workbench.ui.imageGenerationResult,
  ].filter(Boolean);
  const pendingEntry = [...candidates].reverse().find((entry) => {
    const entryAssetId = entry?.assetId ?? entry?.selectionContext?.selectedAssetId ?? null;
    const taskId = resolveGenerationTaskIdForConversation(entry);
    const status = resolveWorkflowStatus(entry?.status ?? entry?.platform?.workflowStatus ?? entry?.workflowStatus);
    return entryAssetId === assetId && Boolean(taskId) && isGenerationTaskPendingStatus(status);
  });
  if (!pendingEntry) {
    return null;
  }
  const taskId = resolveGenerationTaskIdForConversation(pendingEntry);
  return {
    assetId,
    mediaKind,
    taskId,
    scopeKey: `${mediaKind}:${assetId}:${taskId}`,
  };
}

function isGenerationTaskPendingStatus(status) {
  return new Set(["queued", "running", "pending", "submitted", "accepted", "provider_submitted", "processing"])
    .has(String(status ?? "").toLowerCase());
}

function isGenerationTaskTerminalStatus(status) {
  return new Set(["completed", "succeeded", "failed", "canceled", "manual_review_required", "result_unknown"])
    .has(String(status ?? "").toLowerCase());
}

function isRealEpisodeWorkbench(workbench) {
  return (
    workbench.ui.projectPanelMode === "episode-workbench" &&
    hasPersistedEpisodeWorkbenchId(workbench)
  );
}

function isLipSyncTaskLike(taskOrResult) {
  const candidate = taskOrResult ?? {};
  const parameters =
    candidate.parameters && typeof candidate.parameters === "object"
      ? candidate.parameters
      : candidate.result?.parameters && typeof candidate.result.parameters === "object"
        ? candidate.result.parameters
        : {};
  return (
    candidate.lipSyncEnabled === true ||
    parameters?.mode === "lip-sync" ||
    (Array.isArray(candidate.generatedAudioItems) && candidate.generatedAudioItems.length > 0) ||
    (Array.isArray(candidate.result?.generatedAudioItems) && candidate.result.generatedAudioItems.length > 0)
  );
}

function normalizeEpisodeTaskForLegacyResult(task, submission, mediaKind) {
  const result = task?.result ?? {};
  const mediaUrl = mediaKind === "video" ? result.videoUrl : result.imageUrl;
  const isLipSync = mediaKind === "video" && isLipSyncTaskLike(task);
  const generatedAudioItems = Array.isArray(task?.generatedAudioItems)
    ? task.generatedAudioItems
    : Array.isArray(result.generatedAudioItems)
      ? result.generatedAudioItems
      : submission?.generatedAudioItems ?? [];
  return {
    ...task,
    ...submission,
    status: task?.status === "succeeded" ? "completed" : task?.status ?? "running",
    mediaKind,
    taskId: task?.taskId ?? null,
    platform: {
      workflowId: task?.workflowId ?? null,
      workflowStatus: task?.workflowStatus ?? task?.status ?? "running",
      tasks: task?.taskId ? [{ taskId: task.taskId, status: task.status }] : [],
    },
    fixedImages: mediaKind === "image" && mediaUrl
      ? [{
          id: result.storageObjectId ?? task?.taskId,
          label: "分镜图片",
          url: mediaUrl,
          storageObjectId: result.storageObjectId ?? null,
          assetVersionId: null,
        }]
      : [],
    fixedVideos: mediaKind === "video" && mediaUrl && !isLipSync
      ? [{
          id: result.assetVersionId ?? result.storageObjectId ?? task?.taskId,
          label: "分镜视频",
          src: mediaUrl,
          url: mediaUrl,
          storageObjectId: result.storageObjectId ?? null,
          assetVersionId: result.assetVersionId ?? null,
        }]
      : [],
    generatedAudioItems,
    result,
    failure: task?.failure ?? submission?.failure ?? null,
    failureCode: task?.failureCode ?? task?.failure?.failureCode ?? submission?.failureCode ?? null,
    noticeType: task?.failure?.noticeType ?? task?.noticeType ?? submission?.noticeType ?? null,
    creditBalance: task?.creditBalance ?? null,
  };
}

export function applyEpisodeGenerationTaskResult(workbench, task, storyboardId, mediaKind, options = {}) {
  if (!task) {
    return;
  }
  const shouldPersistConversation = options.persistConversation !== false;
  const targetKey = mediaKind === "video" ? "videoGenerationResult" : "imageGenerationResult";
  const current = workbench.ui[targetKey] ?? {};
  const normalized = normalizeEpisodeTaskForLegacyResult(task, current, mediaKind);
  const isAssetScope = (workbench.ui.museScopeMode ?? "storyboard") === "assets";
  const targetType = String(
    task?.targetType ??
      normalized?.targetType ??
      task?.result?.targetType ??
      normalized?.result?.targetType ??
      normalized?.selectionContext?.targetType ??
      "",
  ).trim();
  const shouldUseStoryboardConversation = Boolean(storyboardId) && targetType !== "asset";
  const assetConversationAssetId =
    shouldUseStoryboardConversation
      ? null
      : normalized?.assetId ??
        current?.assetId ??
        (isAssetScope
          ? normalized?.selectionContext?.selectedAssetId ?? current?.selectionContext?.selectedAssetId ?? null
          : null);
  workbench.ui[targetKey] = normalized;
  if (assetConversationAssetId) {
    const assetConversationEntry = {
      ...normalized,
      assetId: assetConversationAssetId,
    };
    appendAssetConversationHistoryEntry(workbench, assetConversationEntry);
    if (
      workbench.ui.projectPanelMode === "episode-workbench" &&
      isAssetScope
    ) {
      workbench.ui.episodeWorkbenchConversationScrollMode = "latest";
    }
    if (shouldPersistConversation) {
      void persistAssetConversationEntry(workbench, assetConversationEntry).catch(() => {});
    }
  }
  if (shouldUseStoryboardConversation) {
    const storyboardConversationEntry = {
      ...normalized,
      storyboardId,
      selectionContext: {
        ...(normalized.selectionContext ?? {}),
        selectedStoryboardId: storyboardId,
      },
    };
    appendStoryboardConversationHistoryEntry(workbench, storyboardConversationEntry);
    if (workbench.ui.projectPanelMode === "episode-workbench" && !isAssetScope) {
      workbench.ui.episodeWorkbenchConversationScrollMode = "latest";
    }
    if (shouldPersistConversation) {
      void persistStoryboardConversationEntry(workbench, storyboardConversationEntry, { includeUserRequest: true }).catch(() => {});
    }
  }
  if (mediaKind === "video" && Array.isArray(normalized.generatedAudioItems) && normalized.generatedAudioItems.length > 0) {
    workbench.ui.lipSyncAudioItems = normalized.generatedAudioItems;
  }
  if (Number.isFinite(Number(normalized.creditBalance))) {
    workbench.ui.creditBalance = Number(normalized.creditBalance);
  }
  if (["failed", "canceled", "manual_review_required", "result_unknown"].includes(String(task.status ?? normalized.status ?? ""))) {
    updateStoryboardGenerationState(workbench, storyboardId, (generationState) => ({
      ...generationState,
      lastSubmission: generationState.lastSubmission
        ? { ...generationState.lastSubmission, status: "failed" }
        : generationState.lastSubmission,
    }));
    workbench.ui.toast = generationTaskNoticePrefix(task) + generationTaskFailureMessage(task);
    return;
  }
  if (resolveWorkflowStatus(task.status) !== "completed") {
    return;
  }
  if (mediaKind === "video" && isLipSyncTaskLike(task)) {
    updateStoryboardGenerationState(workbench, storyboardId, (generationState) => ({
      ...generationState,
      lastSubmission: generationState.lastSubmission
        ? { ...generationState.lastSubmission, status: "completed" }
        : generationState.lastSubmission,
    }));
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
  if (mediaKind === "image") {
    return;
  }
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

function generationTaskFailureMessage(task) {
  const displayMessage = String(task?.failure?.displayMessage ?? "").trim();
  if (displayMessage) {
    return displayMessage;
  }
  const failureCode = String(task?.failureCode ?? task?.failure?.failureCode ?? "").trim();
  const finalizeMessage = generationFinalizeFailureMessage(failureCode);
  if (finalizeMessage) {
    return finalizeMessage;
  }
  const providerMessage = String(task?.failure?.providerMessage ?? "").trim();
  if (providerMessage) {
    return providerMessage;
  }
  const providerErrorCode = String(task?.failure?.providerErrorCode ?? "").trim();
  if (providerErrorCode) {
    return providerErrorCode;
  }
  return (
    modelGenerationErrorMessage(task?.failureCode) ||
    String(task?.failureCode ?? task?.failure?.failureCode ?? "任务失败，请稍后重试")
  );
}

function generationTaskNoticePrefix(task) {
  const noticeType = String(task?.failure?.noticeType ?? task?.noticeType ?? "").trim();
  if (noticeType === "manual_review" || noticeType === "admin_action_required") {
    return "需要后台处理：";
  }
  if (noticeType === "warning") {
    return "生成提醒：";
  }
  return "生成失败：";
}

function generationFinalizeFailureMessage(failureCode) {
  return (
    {
      provider_output_persist_failed: "已保存到平台存储，正在等待后台补写资产记录",
      provider_output_upload_failed: "视频已生成，但保存到平台存储失败，积分已返还",
      provider_output_download_failed: "供应商产物下载失败，积分已返还，可在链接未过期时由后台重试保存",
    }[String(failureCode ?? "")] ?? ""
  );
}

function shouldContinueGenerationPolling(workbench, storyboardId, mediaKind) {
  const targetKey = mediaKind === "video" ? "videoGenerationResult" : "imageGenerationResult";
  if (isGenerationTaskTerminalStatus(resolveWorkflowStatus(workbench.ui[targetKey]?.status))) {
    return false;
  }
  const storyboard = getActiveStoryboards(workbench).find((item) => item.id === storyboardId);
  if (!storyboard) {
    return false;
  }
  if (mediaKind === "video") {
    if (workbench.ui.episodeMediaMode === "lip-sync") {
      return false;
    }
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

function dedupeMentionReferenceItems(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.assetId ?? item.id ?? item.token;
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function resolvePromptMentionAssetBuckets(workbench) {
  const importedAssets = workbench.ui.importedAssets ?? {};
  const importedCount =
    (importedAssets.character?.length ?? 0) +
    (importedAssets.scene?.length ?? 0) +
    (importedAssets.prop?.length ?? 0);
  if (importedCount > 0) {
    return importedAssets;
  }
  const detailAssets =
    workbench.ui.projectDetail?.assetsByType ??
    workbench.state?.projectDetail?.assetsByType ??
    null;
  if (!detailAssets) {
    return importedAssets;
  }
  return mapProjectDetailAssets(detailAssets);
}

export function updatePromptMentionState(workbench, value, selectionStart) {
  const text = String(value ?? "");
  const cursor = Math.max(0, Number(selectionStart ?? text.length));
  const beforeCursor = text.slice(0, cursor);
  if ((workbench.ui.museScopeMode ?? "storyboard") !== "storyboard") {
    clearPromptMentionUi(workbench);
    return;
  }
  const completeMentionAsset = resolveCompletePromptMentionAsset(workbench, text, cursor);
  if (completeMentionAsset) {
    workbench.ui.promptMentionMenuOpen = false;
    workbench.ui.promptMentionQuery = "";
    workbench.ui.promptMentionSuggestions = [];
    workbench.ui.promptMentionPreviewOpen = true;
    workbench.ui.promptMentionPreviewAsset = completeMentionAsset;
    return;
  }
  const mentionMatch = /(?:^|\s)@([^\s【】]*)$/.exec(beforeCursor);
  if (!mentionMatch) {
    clearPromptMentionUi(workbench);
    return;
  }

  const query = String(mentionMatch[1] ?? "").trim().toLowerCase();
  const mentionAssetBuckets = resolvePromptMentionAssetBuckets(workbench);
  const suggestions = [
    ...(mentionAssetBuckets.character ?? []).map((item) => ({ ...item, assetKind: "character" })),
    ...(mentionAssetBuckets.scene ?? []).map((item) => ({ ...item, assetKind: "scene" })),
    ...(mentionAssetBuckets.prop ?? []).map((item) => ({ ...item, assetKind: "prop" })),
  ]
    .filter((item) => {
      if (!query) return true;
      return [item.name, item.description]
        .map((entry) => String(entry ?? "").toLowerCase())
        .some((entry) => entry.includes(query));
    })
    .slice(0, 6);

  workbench.ui.promptMentionMenuOpen = suggestions.length > 0;
  workbench.ui.promptMentionQuery = query;
  workbench.ui.promptMentionSuggestions = suggestions;
  workbench.ui.promptMentionPreviewOpen = false;
  workbench.ui.promptMentionPreviewAsset = null;
}

function clearPromptMentionUi(workbench) {
  workbench.ui.promptMentionMenuOpen = false;
  workbench.ui.promptMentionQuery = "";
  workbench.ui.promptMentionSuggestions = [];
  workbench.ui.promptMentionPreviewOpen = false;
  workbench.ui.promptMentionPreviewAsset = null;
}

function snapshotPromptMentionUi(workbench) {
  return {
    menuOpen: Boolean(workbench.ui.promptMentionMenuOpen),
    query: String(workbench.ui.promptMentionQuery ?? ""),
    suggestionIds: (workbench.ui.promptMentionSuggestions ?? [])
      .map((item) => String(item?.id ?? item?.assetId ?? item?.name ?? ""))
      .join("|"),
    previewOpen: Boolean(workbench.ui.promptMentionPreviewOpen),
    previewAssetId: String(
      workbench.ui.promptMentionPreviewAsset?.id ??
      workbench.ui.promptMentionPreviewAsset?.assetId ??
      workbench.ui.promptMentionPreviewAsset?.name ??
      "",
    ),
  };
}

function hasPromptMentionUiChanged(previous, workbench) {
  const next = snapshotPromptMentionUi(workbench);
  return (
    previous.menuOpen !== next.menuOpen ||
    previous.query !== next.query ||
    previous.suggestionIds !== next.suggestionIds ||
    previous.previewOpen !== next.previewOpen ||
    previous.previewAssetId !== next.previewAssetId
  );
}

function syncPromptMentionAfterSelection(workbench, textarea) {
  if (!textarea?.matches?.("#video-prompt-input")) {
    return;
  }
  const selectionStart = Number(textarea.selectionStart ?? textarea.value.length);
  const selectionEnd = Number(textarea.selectionEnd ?? selectionStart);
  const scrollTop = Number(textarea.scrollTop ?? 0);
  const beforeMentionUi = snapshotPromptMentionUi(workbench);
  updatePromptMentionState(workbench, textarea.value, selectionStart);
  if (!workbench.ui.promptMentionPreviewOpen) {
    removePromptMentionPreviewDom(workbench);
  }
  if (!hasPromptMentionUiChanged(beforeMentionUi, workbench)) {
    positionPromptMentionPreview(workbench, textarea);
    return;
  }
  render(workbench);
  queueMicrotask(() => {
    const nextTextarea = workbench.root.querySelector("#video-prompt-input");
    if (nextTextarea) {
      nextTextarea.focus();
      nextTextarea.setSelectionRange(selectionStart, selectionEnd);
      nextTextarea.scrollTop = scrollTop;
      positionPromptMentionPreview(workbench, nextTextarea);
    }
  });
}

function dismissPromptMentionPreview(workbench) {
  if (!workbench?.ui) {
    return;
  }
  workbench.ui.promptMentionPreviewOpen = false;
  workbench.ui.promptMentionPreviewAsset = null;
  workbench.ui.promptMentionMenuOpen = false;
  workbench.ui.promptMentionQuery = "";
  workbench.ui.promptMentionSuggestions = [];
  removePromptMentionPreviewDom(workbench);
}

function removePromptMentionPreviewDom(workbench) {
  workbench?.root
    ?.querySelectorAll?.(".episode-replica-mention-preview[data-floating='caret']")
    ?.forEach((node) => node.remove());
}

function positionPromptMentionPreview(workbench, textarea = null) {
  const root = workbench?.root ?? null;
  const input = textarea ?? root?.querySelector?.("#video-prompt-input");
  const prompt = input?.closest?.(".episode-replica-prompt") ?? null;
  const preview = prompt?.querySelector?.(".episode-replica-mention-preview[data-floating='caret']");
  if (!prompt || !preview || !input) {
    return;
  }
  const mentionToken = resolvePromptMentionTokenAtCursor(String(input.value ?? ""), Number(input.selectionStart ?? 0));
  const caret = resolveTextareaCaretViewportPosition(input, mentionToken?.end ?? Number(input.selectionStart ?? 0));
  const promptRect = prompt.getBoundingClientRect();
  const inputRect = input.getBoundingClientRect();
  const previewRect = preview.getBoundingClientRect();
  const gap = 10;
  const fallbackX = inputRect.left + 12;
  const fallbackY = inputRect.top + 12;
  const viewportX = Number.isFinite(caret?.left) ? caret.left + gap : fallbackX;
  const viewportY = Number.isFinite(caret?.top) ? caret.top + ((caret?.lineHeight ?? previewRect.height) - previewRect.height) / 2 : fallbackY;
  const minX = inputRect.left + 8 - promptRect.left;
  const minY = inputRect.top + 8 - promptRect.top;
  const maxX = Math.max(minX, inputRect.right - previewRect.width - 8 - promptRect.left);
  const maxY = Math.max(minY, inputRect.bottom - previewRect.height - 8 - promptRect.top);
  const x = Math.min(Math.max(minX, viewportX - promptRect.left), maxX);
  const y = Math.min(Math.max(minY, viewportY - promptRect.top), maxY);
  preview.style.setProperty("--prompt-mention-x", `${x}px`);
  preview.style.setProperty("--prompt-mention-y", `${y}px`);
}

function resolveTextareaCaretViewportPosition(textarea, selectionIndex = null) {
  if (!textarea || typeof document === "undefined") {
    return null;
  }
  const selectionStart = Number(selectionIndex ?? textarea.selectionStart ?? String(textarea.value ?? "").length);
  const value = String(textarea.value ?? "");
  const beforeCaret = value.slice(0, Math.max(0, selectionStart));
  const mirror = document.createElement("div");
  const caretMarker = document.createElement("span");
  const style = window.getComputedStyle(textarea);
  const mirroredProperties = [
    "boxSizing",
    "width",
    "height",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "fontFamily",
    "fontSize",
    "fontWeight",
    "fontStyle",
    "letterSpacing",
    "lineHeight",
    "textTransform",
    "textAlign",
    "wordSpacing",
    "tabSize",
  ];
  mirroredProperties.forEach((property) => {
    mirror.style[property] = style[property];
  });
  mirror.style.position = "fixed";
  mirror.style.left = "-9999px";
  mirror.style.top = "0";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflowWrap = "break-word";
  mirror.style.visibility = "hidden";
  mirror.style.overflow = "hidden";
  mirror.textContent = beforeCaret || " ";
  caretMarker.textContent = "\u200b";
  mirror.append(caretMarker);
  document.body.append(mirror);
  mirror.scrollTop = textarea.scrollTop;
  const textareaRect = textarea.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();
  const markerRect = caretMarker.getBoundingClientRect();
  const left = textareaRect.left + markerRect.left - mirrorRect.left;
  const top = textareaRect.top + markerRect.top - mirrorRect.top - textarea.scrollTop;
  const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) || 16;
  mirror.remove();
  return {
    left,
    top,
    bottom: top + lineHeight,
    lineHeight,
  };
}

function resolveCompletePromptMentionAsset(workbench, textOrBeforeCursor, cursor = null) {
  const token = cursor == null
    ? resolvePromptMentionTokenAtCursor(String(textOrBeforeCursor ?? ""), String(textOrBeforeCursor ?? "").length)
    : resolvePromptMentionTokenAtCursor(String(textOrBeforeCursor ?? ""), cursor);
  const mentionName = String(token?.name ?? "").trim();
  if (!mentionName) {
    return null;
  }
  const mentionAssetBuckets = resolvePromptMentionAssetBuckets(workbench);
  const assets = [
    ...(mentionAssetBuckets.character ?? []).map((item) => ({ ...item, assetKind: "character" })),
    ...(mentionAssetBuckets.scene ?? []).map((item) => ({ ...item, assetKind: "scene" })),
    ...(mentionAssetBuckets.prop ?? []).map((item) => ({ ...item, assetKind: "prop" })),
  ];
  const matched = assets.find((item) => String(item.name ?? item.label ?? "").trim() === mentionName);
  if (!matched) {
    return null;
  }
  return {
    ...matched,
    name: matched.name ?? matched.label ?? mentionName,
    previewUrl:
      matched.fixedImageUrl ??
      matched.previewUrl ??
      matched.preview ??
      matched.sourceUrl ??
      matched.latestVersion?.previewUrl ??
      matched.latestVersion?.metadata?.previewUrl ??
      null,
  };
}

function resolvePromptMentionTokenAtCursor(text, cursor) {
  const value = String(text ?? "");
  const caret = Math.max(0, Math.min(value.length, Number(cursor ?? value.length)));
  const tokenPattern = /【@([^】]+)】/g;
  let match;
  while ((match = tokenPattern.exec(value)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (caret >= start && caret <= end) {
      return {
        start,
        end,
        name: String(match[1] ?? "").trim(),
      };
    }
  }
  return null;
}

function insertEpisodeAssetMention(workbench, asset, assetKind) {
  const textarea = workbench.root.querySelector("#video-prompt-input");
  const currentPrompt = String(workbench.ui.prompt ?? "");
  const cursor = Number(textarea?.selectionStart ?? currentPrompt.length);
  const beforeCursor = currentPrompt.slice(0, cursor);
  const afterCursor = currentPrompt.slice(cursor);
  const nextToken = `【@${asset?.name ?? "素材"}】`;
  const replacedBeforeCursor = beforeCursor.replace(/@([^\s【】]*)$/, nextToken);
  workbench.ui.prompt = `${replacedBeforeCursor}${afterCursor}`;

  const selectedStoryboard = getSelectedStoryboard(
    getActiveStoryboards(workbench),
    workbench.ui.selectedStoryboardId,
  );
  const nextMentionReference = {
    id: `mention-ref:${assetKind}:${asset?.id ?? Date.now()}`,
    assetId: asset?.id ?? null,
    kind: assetKind,
    name: asset?.name ?? "引用素材",
    token: nextToken,
    description: asset?.description ?? "",
    preview: asset?.previewUrl ?? asset?.preview ?? asset?.sourceUrl ?? null,
  };
  if (selectedStoryboard) {
    updateStoryboardGenerationState(workbench, selectedStoryboard.id, (generationState) => ({
      ...generationState,
      mentionReferences: dedupeMentionReferenceItems([
        ...(generationState.mentionReferences ?? []),
        nextMentionReference,
      ]),
    }));
  }
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

function removeLocalPrimaryEpisode(workbench) {
  workbench.ui.storyboards = [];
  workbench.state = {
    ...(workbench.state ?? {}),
    shots: (workbench.state?.shots ?? []).filter((shot) => shot?.episodeId),
    projectDetail: workbench.state?.projectDetail
      ? {
          ...workbench.state.projectDetail,
          shots: (workbench.state.projectDetail.shots ?? []).filter((shot) => shot?.episodeId),
          episodes: (workbench.state.projectDetail.episodes ?? []).filter(
            (episode) => episode?.id !== "episode-primary",
          ),
        }
      : workbench.state?.projectDetail,
  };
  workbench.ui.projectDetail = workbench.state.projectDetail ?? workbench.ui.projectDetail;
  workbench.ui.customEpisodes = getDetailEpisodes(workbench.state);
  workbench.ui.episodeStoryboardMap = {
    ...(workbench.ui.episodeStoryboardMap ?? {}),
  };
  delete workbench.ui.episodeStoryboardMap["episode-primary"];
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

  workbench.ui.episodeStoryboardMap = {
    ...workbench.ui.episodeStoryboardMap,
    [episodeId]: [],
  };
  return [];
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

function appendCreatedShotToState(workbench, shot) {
  if (!shot || !shot.id || !workbench.state) {
    return;
  }

  const appendUniqueShot = (shots) => {
    if (!Array.isArray(shots)) {
      return [shot];
    }
    return shots.some((item) => item?.id === shot.id) ? shots : [...shots, shot];
  };

  const nextProjectDetail = workbench.state.projectDetail
    ? {
        ...workbench.state.projectDetail,
        shots: appendUniqueShot(workbench.state.projectDetail.shots),
      }
    : workbench.state.projectDetail;

  workbench.state = {
    ...workbench.state,
    shots: appendUniqueShot(workbench.state.shots),
    projectDetail: nextProjectDetail,
  };
  workbench.ui.projectDetail = nextProjectDetail ?? workbench.ui.projectDetail;
  workbench.ui.customEpisodes = getDetailEpisodes(workbench.state);
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

  const removedIndex = storyboards.findIndex((item) => item.id === storyboardId);
  const nextStoryboards = storyboards.filter((item) => item.id !== storyboardId);
  const fallbackStoryboardId = resolveAdjacentStoryboardId(nextStoryboards, removedIndex);
  const applyLocalRemoval = () => {
    replaceActiveStoryboards(workbench, nextStoryboards);
    workbench.ui.selectedStoryboardId =
      workbench.ui.selectedStoryboardId === storyboardId
        ? fallbackStoryboardId
        : workbench.ui.selectedStoryboardId;
  };

  if (storyboard.linkedShotId && workbench.state?.project?.id) {
    workbench.ui.busy = true;
    workbench.ui.toast = "正在删除当前分镜...";
    render(workbench);
    try {
      await workbench.api.deleteShot({ shotId: storyboard.linkedShotId });
      applyLocalRemoval();
      removeDeletedShotFromState(workbench, storyboard.linkedShotId);
      persistWorkbenchState(workbench);
      workbench.ui.toast = "已删除当前分镜。";
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
  workbench.ui.toast = "已删除当前分镜。";
  render(workbench);
}

function resolveInsertedStoryboardId(storyboards, anchorStoryboardId) {
  if (!Array.isArray(storyboards) || !storyboards.length) {
    return null;
  }
  if (!anchorStoryboardId) {
    return storyboards.at(-1)?.id ?? null;
  }
  const anchorIndex = storyboards.findIndex((storyboard) => storyboard.id === anchorStoryboardId);
  if (anchorIndex < 0) {
    return storyboards.at(-1)?.id ?? null;
  }
  return storyboards[anchorIndex + 1]?.id ?? storyboards.at(-1)?.id ?? null;
}

function resolveAdjacentStoryboardId(storyboards, removedIndex) {
  if (!Array.isArray(storyboards) || !storyboards.length) {
    return null;
  }
  return storyboards[Math.min(removedIndex, storyboards.length - 1)]?.id ?? storyboards.at(-1)?.id ?? null;
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
  if (!getDetailEpisodes(workbench.state).length && Array.isArray(persisted.customEpisodes)) {
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
  if (typeof persisted.museScopeMode === "string") {
    workbench.ui.museScopeMode = persisted.museScopeMode;
  }
  if (typeof persisted.projectAssetTab === "string") {
    workbench.ui.projectAssetTab = persisted.projectAssetTab;
  }
  if (typeof persisted.selectedEpisodeAssetId === "string" || persisted.selectedEpisodeAssetId === null) {
    workbench.ui.selectedEpisodeAssetId = persisted.selectedEpisodeAssetId;
  }
  if (typeof persisted.selectedEpisodeCardId === "string" || persisted.selectedEpisodeCardId === null) {
    workbench.ui.selectedEpisodeCardId = persisted.selectedEpisodeCardId;
  }
  sanitizeEpisodeWorkbenchSelection(workbench, { persist: true });
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
  if (token === "home" || token === "script" || token === "library" || token === "tools") {
    workbench.ui.activeNavTab = token;
    if (token === "library") {
      workbench.ui.libraryTeamRoute = "assets";
    }
    return;
  }
  if (token === "team" || token.startsWith("team-dashboard")) {
    workbench.ui.activeNavTab = "team";
    workbench.ui.libraryTeamRoute = token.startsWith("team-dashboard") ? "team-dashboard" : "team";
    workbench.ui.teamDashboardTab = deriveInitialTeamDashboardTab(token);
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

function hasPersistedEpisodeWorkbenchId(workbench, episodeId = workbench?.ui?.selectedEpisodeId ?? null) {
  if (!episodeId || episodeId === "episode-primary") {
    return false;
  }
  const detailEpisodes = getDetailEpisodes(workbench?.state ?? {});
  return detailEpisodes.some((episode) => episode?.id === episodeId);
}

function resolvePersistedEpisodeWorkbenchId(workbench, episodeId = workbench?.ui?.selectedEpisodeId ?? null) {
  if (hasPersistedEpisodeWorkbenchId(workbench, episodeId)) {
    return episodeId;
  }
  const fallbackEpisodeId = getDefaultEpisodeWorkbenchId(workbench);
  return fallbackEpisodeId === "episode-primary" ? null : fallbackEpisodeId;
}

export function sanitizeEpisodeWorkbenchSelection(workbench, options = {}) {
  const previousEpisodeId = workbench?.ui?.selectedEpisodeId ?? null;
  const resolvedEpisodeId = resolvePersistedEpisodeWorkbenchId(workbench, previousEpisodeId);
  const shouldResetEpisodeSelection =
    workbench?.ui?.projectPanelMode === "episode-workbench" &&
    previousEpisodeId &&
    previousEpisodeId !== "episode-primary" &&
    !hasPersistedEpisodeWorkbenchId(workbench, previousEpisodeId);
  if (!shouldResetEpisodeSelection && previousEpisodeId === resolvedEpisodeId) {
    return false;
  }
  workbench.ui.selectedEpisodeId = resolvedEpisodeId;
  if (shouldResetEpisodeSelection) {
    workbench.ui.selectedEpisodeAssetId = null;
    workbench.ui.selectedEpisodeCardId = null;
    workbench.ui.selectedEpisodeAssetIds = [];
    workbench.ui.imageGenerationResult = null;
    workbench.ui.videoGenerationResult = null;
  }
  if (options.persist === true) {
    writeWorkbenchState(workbench.state?.project?.id ?? null, buildPersistedWorkbenchStatePayload(workbench));
  }
  return true;
}

function persistWorkbenchState(workbench) {
  writeWorkbenchState(workbench.state?.project?.id ?? null, buildPersistedWorkbenchStatePayload(workbench));
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
  if (typeof window === "undefined" || !window.localStorage || !projectId || !payload) {
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

function buildPersistedWorkbenchStatePayload(workbench) {
  const projectId = workbench.state?.project?.id ?? null;
  if (!projectId) {
    return null;
  }
  const detailEpisodes = getDetailEpisodes(workbench.state);
  const selectedEpisodeId = hasPersistedEpisodeWorkbenchId(workbench)
    ? (workbench.ui.selectedEpisodeId ?? null)
    : resolvePersistedEpisodeWorkbenchId(workbench);
  return {
    selectedEpisodeId,
    selectedStoryboardId: workbench.ui.selectedStoryboardId ?? null,
    selectedEpisodeAssetId: workbench.ui.selectedEpisodeAssetId ?? null,
    selectedEpisodeCardId: workbench.ui.selectedEpisodeCardId ?? null,
    projectPanelMode: workbench.ui.projectPanelMode ?? "library",
    projectInteriorSection: workbench.ui.projectInteriorSection ?? "overview",
    museScopeMode: workbench.ui.museScopeMode ?? "storyboard",
    projectAssetTab: workbench.ui.projectAssetTab ?? "character",
    storyboards: Array.isArray(workbench.ui.storyboards) ? workbench.ui.storyboards : [],
    episodeStoryboardMap: workbench.ui.episodeStoryboardMap ?? {},
    customEpisodes: detailEpisodes.length
      ? detailEpisodes
      : (Array.isArray(workbench.ui.customEpisodes) ? workbench.ui.customEpisodes : []),
  };
}

function syncSelectedEpisodeAssetForCurrentTab(workbench) {
  const assetTab = workbench.ui.projectAssetTab ?? "character";
  const assetEntries =
    assetTab === "other"
      ? workbench.ui.importedAssets?.other?.[workbench.ui.projectOtherAssetMediaType ?? "image"] ?? []
      : workbench.ui.importedAssets?.[assetTab] ?? [];
  const selectedId =
    assetEntries.find((item) => item.id === workbench.ui.selectedEpisodeCardId)?.id ??
    assetEntries.find((item) => item.id === workbench.ui.selectedEpisodeAssetId)?.id ??
    assetEntries[0]?.id ??
    null;
  workbench.ui.selectedEpisodeCardId = selectedId;
  workbench.ui.selectedEpisodeAssetId = selectedId;
  const validIds = new Set(assetEntries.map((item) => item.id));
  workbench.ui.selectedEpisodeAssetIds = (workbench.ui.selectedEpisodeAssetIds ?? []).filter((id) => validIds.has(id));
  return selectedId;
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
    await runAction(workbench, "正在同步分镜图片...", async () => {
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

  workbench.ui.toast = `已上传 ${file.name}，可继续作为分镜图片使用。`;
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
    await runAction(workbench, "正在同步分镜视频...", async () => {
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

  if (storyboard?.linkedShotId && typeof workbench.api?.updateShot === "function") {
    await runAction(workbench, "正在设置分镜视频...", async () => {
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

async function setStoryboardVideoResult(workbench, storyboardId, videoId, preferredVideo = null, prompt = "") {
  const storyboard = getActiveStoryboards(workbench).find((item) => item.id === storyboardId);
  const selectedVideo =
    (preferredVideo && preferredVideo.id === videoId && preferredVideo.status === "ready"
      ? preferredVideo
      : null) ??
    (storyboard?.uploadedVideos ?? []).find(
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
    await runAction(workbench, "正在设置分镜视频...", async () => {
      let savedVideoSrc = selectedVideo.src;
      let savedVideoId = videoId;
      let savedThumbnailSrc = selectedVideo.thumbnailSrc ?? null;
      const result = await workbench.api.setStoryboardVideo(
        workbench.ui.selectedEpisodeId,
        storyboardId,
        {
          assetVersionId: selectedVideo.assetVersionId ?? videoId,
          storageObjectId: selectedVideo.storageObjectId ?? null,
          sourceUrl: selectedVideo.src ?? selectedVideo.url ?? null,
          thumbnailUrl: selectedVideo.thumbnailSrc ?? null,
        },
      );
      updateStoryboardById(workbench, storyboardId, (currentStoryboard) => {
        const file = result?.file ?? {};
        const src =
          result?.storyboard?.currentVideoUrl ??
          file.sourceUrl ??
          file.previewUrl ??
          selectedVideo.src;
        savedVideoSrc = src;
        savedVideoId = result?.storyboard?.currentVideoFileId ?? videoId;
        savedThumbnailSrc =
          result?.storyboard?.currentVideoThumbnailUrl ??
          file.thumbnailUrl ??
          selectedVideo.thumbnailSrc ??
          null;
        const nextStoryboard = {
          ...currentStoryboard,
          selectedUploadedVideoId: savedVideoId,
          previewVideo: src,
          previewThumbnailUrl:
            savedThumbnailSrc,
          currentVideoAssetVersionId: savedVideoId,
          pendingCurrentVideoAssetVersionId: savedVideoId,
          pendingCurrentVideoSourceUrl: src,
          pendingCurrentVideoThumbnailUrl: savedThumbnailSrc,
          videoStatus: "ready",
          uploadedVideos: mergeStoryboardUploadedVideos(currentStoryboard.uploadedVideos ?? [], [
            {
              ...selectedVideo,
              id: savedVideoId,
              src,
              storageObjectId: file.storageObjectId ?? selectedVideo.storageObjectId ?? null,
              thumbnailSrc: savedThumbnailSrc,
              status: "ready",
            },
          ]),
        };
        return {
          ...nextStoryboard,
          previewUrl: resolveStoryboardCombinedPreviewUrl(nextStoryboard),
        };
      });
      if (workbench.ui.selectedEpisodeId && typeof workbench.api?.listStoryboards === "function") {
        await loadEpisodeStoryboardsForWorkbench(workbench, workbench.ui.selectedEpisodeId);
        updateStoryboardById(workbench, storyboardId, (currentStoryboard) => {
          const persistedVideo =
            (currentStoryboard.uploadedVideos ?? []).find(
              (item) => item.id === savedVideoId && item.status === "ready",
            ) ??
            (currentStoryboard.uploadedVideos ?? []).find(
              (item) => item.status === "ready" && item.src === savedVideoSrc,
            ) ??
            null;
          const nextVideoId = persistedVideo?.id ?? savedVideoId;
          const nextStoryboard = {
            ...currentStoryboard,
            selectedUploadedVideoId: nextVideoId,
            currentVideoAssetVersionId: nextVideoId,
            previewVideo: persistedVideo?.src ?? savedVideoSrc ?? currentStoryboard.previewVideo ?? null,
            previewThumbnailUrl:
              persistedVideo?.thumbnailSrc ?? savedThumbnailSrc ?? currentStoryboard.previewThumbnailUrl ?? null,
            videoStatus: "ready",
            pendingCurrentVideoAssetVersionId: nextVideoId,
            pendingCurrentVideoSourceUrl: persistedVideo?.src ?? savedVideoSrc ?? null,
            pendingCurrentVideoThumbnailUrl:
              persistedVideo?.thumbnailSrc ?? savedThumbnailSrc ?? currentStoryboard.previewThumbnailUrl ?? null,
            uploadedVideos: mergeStoryboardUploadedVideos(currentStoryboard.uploadedVideos ?? [], [
              {
                ...selectedVideo,
                ...(persistedVideo ?? {}),
                id: nextVideoId,
                src: persistedVideo?.src ?? savedVideoSrc,
                storageObjectId:
                  persistedVideo?.storageObjectId ??
                  selectedVideo.storageObjectId ??
                  null,
                thumbnailSrc: persistedVideo?.thumbnailSrc ?? savedThumbnailSrc ?? null,
                status: "ready",
              },
            ]),
          };
          return {
            ...nextStoryboard,
            previewUrl: resolveStoryboardCombinedPreviewUrl(nextStoryboard),
          };
        });
      }
      applyStoryboardResultPrompt(workbench, storyboardId, prompt);
      persistWorkbenchState(workbench);
      hydrateStoryboardVideoPreview(workbench, storyboardId, savedVideoId, savedVideoSrc);
    });
    return;
  }
  await selectStoryboardUploadedVideo(workbench, storyboardId, videoId);
  applyStoryboardResultPrompt(workbench, storyboardId, prompt);
  persistWorkbenchState(workbench);
  render(workbench);
}

async function setStoryboardImageResult(workbench, storyboardId, imageId, prompt = "", imageOverride = null) {
  const storyboard = getActiveStoryboards(workbench).find((item) => item.id === storyboardId);
  const image = imageOverride?.src ? imageOverride : findStoryboardImage(storyboard, imageId);
  const imageAssetVersionId = image?.assetVersionId ?? (isUuidLike(image?.id) ? image.id : null);
  const imageStorageObjectId = image?.storageObjectId ?? null;
  if (!storyboardId || !image) {
    workbench.ui.toast = "当前没有可设置的分镜图片。";
    render(workbench);
    return;
  }
  if (
    isRealEpisodeWorkbench(workbench) &&
    typeof workbench.api.setStoryboardImage === "function" &&
    isUuidLike(storyboardId) &&
    (isUuidLike(imageAssetVersionId) || isUuidLike(imageStorageObjectId))
  ) {
    await runAction(workbench, "正在设置分镜图片...", async () => {
      const result = await workbench.api.setStoryboardImage(
        workbench.ui.selectedEpisodeId,
        storyboardId,
        {
          assetVersionId: isUuidLike(imageAssetVersionId) ? imageAssetVersionId : null,
          storageObjectId: isUuidLike(imageStorageObjectId) ? imageStorageObjectId : null,
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
      applyStoryboardResultPrompt(workbench, storyboardId, prompt);
      persistWorkbenchState(workbench);
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
  applyStoryboardResultPrompt(workbench, storyboardId, prompt);
  persistWorkbenchState(workbench);
  render(workbench);
}

async function createEpisodeExportPreview(workbench) {
  return createEpisodeExportPreviewWithKind(workbench, "mp4");
}

async function createEpisodeExportPreviewWithKind(workbench, exportKind = "mp4") {
  const fallbackPreview = async () => {
    const preview = await workbench.api.previewExport();
    return {
      ...preview,
      export: {
        ...(preview?.export ?? {}),
        kind: exportKind,
      },
    };
  };
  if (
    isRealEpisodeWorkbench(workbench) &&
    typeof workbench.api.createEpisodeExportTask === "function"
  ) {
    const storyboards = getActiveStoryboards(workbench);
    const hasIncompleteStoryboard = storyboards.some((storyboard) => {
      const hasVideo =
        Boolean(storyboard?.previewVideo) ||
        Boolean(storyboard?.currentVideoAssetVersionId) ||
        (storyboard?.uploadedVideos ?? []).some((item) => item?.status === "ready" && item?.src);
      return !hasVideo;
    });
    if (hasIncompleteStoryboard) {
      const error = new Error("还有分镜未完成，暂时无法导出");
      error.code = "storyboard_export_blocked";
      throw error;
    }
    const exportableVideos = storyboards.flatMap((storyboard) =>
      (storyboard.uploadedVideos ?? []).filter(
        (item) =>
          item?.status === "ready" &&
          (item.storageObjectId || item.assetVersionId || isUuidLike(item.id)),
      ),
    );
    const selectedVideo =
      storyboards
        .map((storyboard) =>
          (storyboard.uploadedVideos ?? []).find(
            (item) =>
              item?.status === "ready" &&
              item.id === (storyboard.selectedUploadedVideoId ?? storyboard.currentVideoAssetVersionId) &&
              (item.storageObjectId || item.assetVersionId || isUuidLike(item.id)),
            ) ?? null,
        )
        .find(Boolean) ?? null;
    const latestGeneratedVideo =
      (workbench.ui.videoGenerationResult?.fixedVideos ?? []).find(
        (item) => item && (item.assetVersionId || item.storageObjectId || isUuidLike(item.id)) && (item.src || item.url),
      ) ??
      (workbench.ui.videoGenerationResult?.result?.videoUrl
        ? {
            id:
              workbench.ui.videoGenerationResult?.result?.assetVersionId ??
              workbench.ui.videoGenerationResult?.result?.storageObjectId ??
              workbench.ui.videoGenerationResult?.taskId ??
              null,
            assetVersionId: workbench.ui.videoGenerationResult?.result?.assetVersionId ?? null,
            storageObjectId: workbench.ui.videoGenerationResult?.result?.storageObjectId ?? null,
            src: workbench.ui.videoGenerationResult?.result?.videoUrl ?? null,
            url: workbench.ui.videoGenerationResult?.result?.videoUrl ?? null,
          }
        : null);
    const exportCandidate =
      latestGeneratedVideo ??
      selectedVideo ??
      exportableVideos.find((item) => item.storageObjectId || item.assetVersionId || isUuidLike(item.id)) ??
      null;
    if (!exportCandidate) {
      const error = new Error("还有分镜未完成，暂时无法导出");
      error.code = "storyboard_export_blocked";
      throw error;
    }
    const result = await workbench.api.createEpisodeExportTask(workbench.ui.selectedEpisodeId, {
      assetVersionId: exportCandidate.assetVersionId ?? exportCandidate.id,
      storageObjectId: exportCandidate.storageObjectId ?? null,
      exportType: exportKind,
    });
    return {
      exportRecord: result?.exportTask ?? null,
      export: {
        status: result?.exportTask?.status ?? "ready",
        signedUrl: result?.exportTask?.downloadUrl ?? null,
        sourceUrl: result?.exportTask?.sourceUrl ?? null,
        workflowId: result?.exportTask?.workflowId ?? null,
        kind: exportKind,
      },
    };
  }
  return fallbackPreview();
}

function resolveExportPreviewDownloadUrl(exportPreviewResult) {
  return (
    exportPreviewResult?.platform?.signedUrl ??
    exportPreviewResult?.export?.signedUrl ??
    exportPreviewResult?.export?.url ??
    ""
  );
}

function resolveEpisodeExportModalError(error) {
  const code = String(error?.code ?? error?.errorCode ?? "");
  if (code === "storyboard_export_blocked" || code === "storyboard_media_incomplete") {
    return "请确保所有分镜都已生成图片或者视频";
  }
  return friendlyError(error);
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
    await runAction(workbench, "正在取消分镜视频选择...", async () => {
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
  appendCreatedShotToState(workbench, result.shot);
  return getActiveStoryboards(workbench).find((item) => item.linkedShotId === result.shot?.id) ?? storyboard;
}

function applyPostRenderEffects(workbench) {
  positionPromptMentionPreview(workbench);
  scheduleSelectedAssetGenerationPolling(workbench, "image");
  const episodeWorkbenchScrollTarget = workbench.ui.episodeWorkbenchScrollTarget ?? null;
  const episodeWorkbenchConversationScrollMode = workbench.ui.episodeWorkbenchConversationScrollMode ?? null;
  if (
    episodeWorkbenchScrollTarget &&
    workbench.ui.projectPanelMode === "episode-workbench" &&
    (workbench.ui.museScopeMode ?? "assets") === "assets"
  ) {
    const scrollContainer = workbench.root.querySelector(".episode-replica-left");
    const targetSection = workbench.root.querySelector(
      `[data-asset-section="${escapeAttributeSelector(episodeWorkbenchScrollTarget)}"]`,
    );
    if (scrollContainer && targetSection) {
      const stickyHead = workbench.root.querySelector(".episode-replica-asset-toolbar-head");
      const stickyOffset = stickyHead?.getBoundingClientRect().height ?? 0;
      const offsetTop =
        targetSection.getBoundingClientRect().top -
        scrollContainer.getBoundingClientRect().top +
        scrollContainer.scrollTop -
        stickyOffset;
      scrollContainer.scrollTo({
        top: Math.max(0, offsetTop),
        behavior: "smooth",
      });
    }
    workbench.ui.episodeWorkbenchScrollTarget = null;
  }

  if (
    (episodeWorkbenchConversationScrollMode === "latest" || episodeWorkbenchConversationScrollMode === "bottom") &&
    workbench.ui.projectPanelMode === "episode-workbench" &&
    (workbench.ui.museScopeMode ?? "assets") === "assets"
  ) {
    const conversationContainer = workbench.root.querySelector(".episode-replica-stage-body");
    const latestConversationEntry = conversationContainer?.querySelector(
      ".episode-replica-asset-conversation-entry:last-of-type",
    );
    if (episodeWorkbenchConversationScrollMode === "latest" && latestConversationEntry) {
      latestConversationEntry.scrollIntoView({ block: "end", inline: "nearest", behavior: "smooth" });
    } else if (conversationContainer) {
      conversationContainer.scrollTo({ top: conversationContainer.scrollHeight, behavior: "smooth" });
    }
    workbench.ui.episodeWorkbenchConversationScrollMode = null;
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

function disposeHomeLiquidEther(workbench) {
  workbench.homeLiquidEtherToken = Symbol("liquid-ether-disposed");
  if (!workbench.homeLiquidEther) {
    return;
  }
  workbench.homeLiquidEther.dispose();
  workbench.homeLiquidEther = null;
}

function syncHomeLiquidEther(workbench) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const mount = workbench.root.querySelector("[data-liquid-ether-root]");
  if (!mount) {
    disposeHomeLiquidEther(workbench);
    return;
  }

  const token = Symbol("liquid-ether-mount");
  workbench.homeLiquidEtherToken = token;

  import("./liquid-ether.js?liquid-ether=3")
    .then(({ mountLiquidEther }) => {
      if (workbench.homeLiquidEtherToken !== token || !mount.isConnected) {
        return;
      }
      const instance = mountLiquidEther(mount, {
        colors: ["#5B21B6", "#7C3AED", "#A855F7", "#E879F9", "#67E8F9"],
        mouseForce: 18,
        cursorSize: 120,
        resolution: 0.42,
        isViscous: false,
        iterationsPoisson: 28,
        autoDemo: true,
        autoSpeed: 0.42,
        autoIntensity: 2.35,
        autoResumeDelay: 1200,
        autoRampDuration: 0.7,
      });
      if (workbench.homeLiquidEtherToken !== token || !mount.isConnected) {
        instance.dispose();
        return;
      }
      mount.dataset.liquidEtherState = "ready";
      workbench.homeLiquidEther = instance;
    })
    .catch((error) => {
      mount.dataset.liquidEtherState = "failed";
      console.warn("LiquidEther failed to mount", error);
    });
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
  if (typeof document === "undefined") {
    return;
  }
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
  const targetAsset =
    currentAssets.find((item) => matchesAssetRecordId(item, assetId)) ??
    collectEpisodeAssetCandidates(workbench, assetKind).find((item) => matchesAssetRecordId(item, assetId)) ??
    null;
  if (!targetAsset) {
    return;
  }

  syncEpisodeAssetDescriptionState(workbench, assetKind, assetId, description);

  if (
    isRealEpisodeWorkbench(workbench) &&
    typeof workbench.api.updateEpisodeAsset === "function" &&
    workbench.ui.selectedEpisodeId &&
    (targetAsset.assetId || isUuidLike(assetId))
  ) {
    try {
      await workbench.api.updateEpisodeAsset(
        workbench.ui.selectedEpisodeId,
        targetAsset.assetId ?? assetId,
        { description },
      );
    } catch (_error) {
      workbench.ui.toast = "资产描述保存失败。";
    }
  }

  render(workbench);
}

async function saveStoryboardDescriptionInline(workbench, storyboardId, value) {
  const description = String(value ?? "").trim();
  const storyboards = getActiveStoryboards(workbench);
  const targetStoryboard = storyboards.find((item) => item.id === storyboardId) ?? null;
  if (!targetStoryboard) {
    return;
  }
  if (String(targetStoryboard.description ?? "").trim() === description) {
    return;
  }

  replaceActiveStoryboards(
    workbench,
    storyboards.map((storyboard) =>
      storyboard.id === storyboardId
        ? {
            ...storyboard,
            description,
          }
        : storyboard,
    ),
  );

  if (
    isRealEpisodeWorkbench(workbench) &&
    typeof workbench.api.updateShot === "function" &&
    targetStoryboard.linkedShotId
  ) {
    try {
      await workbench.api.updateShot({
        shotId: targetStoryboard.linkedShotId,
        description,
      });
      return;
    } catch (_error) {
      workbench.ui.toast = "分镜内容保存失败。";
    }
  }

  render(workbench);
}

function handleEpisodeWorkbenchAttachmentFiles(workbench, attachmentType, files) {
  void runAction(
    workbench,
    `正在上传${attachmentType === "audio" ? "音频" : "图片"}附件...`,
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
      workbench.ui.toast = `已上传 ${nextItems.length} 个${attachmentType === "audio" ? "音频" : "图片"}附件。`;
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
      ? `${label}库已新增 ${count} 项素材，已为你定位到最新内容。`
      : `已返回${label}库。`;
  workbench.ui.assetLibraryPendingFocusAssetIds = normalizedIds;
  workbench.ui.toast =
    count > 0
      ? `${label}库已新增 ${count} 项素材，已为你定位到最新内容。`
      : `已返回${label}库。`;
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
    return mediaType === "video" ? "视频素材" : "图片素材";
  }
  return (
    {
      character: "角色",
      scene: "场景",
      prop: "道具",
    }[assetKind] ?? "素材"
  );
}

function inferEpisodeVoiceSource(asset) {
  const explicit = String(asset?.voiceSource ?? "").trim();
  if (explicit === "system" || explicit === "custom") {
    return explicit;
  }
  const voiceId = String(asset?.voiceId ?? "").trim().toLowerCase();
  if (voiceId.startsWith("system-")) {
    return "system";
  }
  if (voiceId.startsWith("custom-")) {
    return "custom";
  }
  const voiceName = String(asset?.voiceName ?? "").trim();
  if (voiceName && voiceName.includes("/")) {
    return "system";
  }
  return "custom";
}

function triggerBrowserDownload(url, fileName) {
  if (typeof document === "undefined" || !url) {
    return;
  }
  if (typeof window !== "undefined") {
    window.__lastDownloadTrigger = {
      url,
      fileName: fileName || "",
      triggeredAt: Date.now(),
    };
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
  if (String(url ?? "").startsWith(".")) {
    return `${normalizedBaseName}${url}`;
  }
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

function matchesAssetRecordId(record, assetId) {
  const normalizedAssetId = String(assetId ?? "").trim();
  if (!normalizedAssetId) {
    return false;
  }
  return [record?.id, record?.assetId].some((value) => String(value ?? "").trim() === normalizedAssetId);
}

function updateAssetRecordBucket(bucket, assetId, updater) {
  if (Array.isArray(bucket)) {
    let changed = false;
    const nextBucket = bucket.map((item) => {
      if (!matchesAssetRecordId(item, assetId)) {
        return item;
      }
      changed = true;
      return updater(item);
    });
    return changed ? nextBucket : bucket;
  }
  if (bucket && typeof bucket === "object" && Array.isArray(bucket.items)) {
    const nextItems = updateAssetRecordBucket(bucket.items, assetId, updater);
    return nextItems === bucket.items ? bucket : { ...bucket, items: nextItems };
  }
  return bucket;
}

export function syncEpisodeAssetDescriptionState(workbench, assetKind, assetId, description) {
  const applyToAssetRecord = (record) => {
    const nextLatestVersionMetadata =
      record?.latestVersion?.metadata && typeof record.latestVersion.metadata === "object"
        ? { ...record.latestVersion.metadata, description }
        : record?.latestVersion
          ? { description }
          : record?.latestVersion?.metadata;
    return {
      ...record,
      description,
      latestVersion: record?.latestVersion
        ? {
            ...record.latestVersion,
            metadata: nextLatestVersionMetadata,
          }
        : record?.latestVersion,
    };
  };

  const nextImportedAssets = cloneImportedAssets(workbench.ui.importedAssets);
  if (assetKind === "other") {
    const mediaType = workbench.ui.projectOtherAssetMediaType ?? "image";
    nextImportedAssets.other[mediaType] = updateAssetRecordBucket(
      nextImportedAssets.other[mediaType],
      assetId,
      applyToAssetRecord,
    );
  } else {
    nextImportedAssets[assetKind] = updateAssetRecordBucket(
      nextImportedAssets[assetKind],
      assetId,
      applyToAssetRecord,
    );
  }
  workbench.ui.importedAssets = nextImportedAssets;

  const previousContext = workbench.ui.episodeWorkbenchContext;
  if (previousContext && typeof previousContext === "object") {
    const nextContext = structuredClone(previousContext);
    const contextRoots = [nextContext, nextContext?.data].filter((value) => value && typeof value === "object");
    for (const root of contextRoots) {
      for (const bucketName of ["assetsByType", "assets", "episodeAssets"]) {
        const assetsByType = root?.[bucketName];
        if (!assetsByType || typeof assetsByType !== "object") {
          continue;
        }
        for (const kind of ["character", "characters", "role", "roles", "scene", "scenes", "prop", "props"]) {
          if (kind in assetsByType) {
            assetsByType[kind] = updateAssetRecordBucket(assetsByType[kind], assetId, applyToAssetRecord);
          }
        }
      }
    }
    workbench.ui.episodeWorkbenchContext = nextContext;
  }

  const previousProjectDetail = workbench.state?.projectDetail ?? workbench.ui.projectDetail ?? null;
  if (previousProjectDetail?.assetsByType && typeof previousProjectDetail.assetsByType === "object") {
    const nextAssetsByType = {
      ...previousProjectDetail.assetsByType,
      character: updateAssetRecordBucket(previousProjectDetail.assetsByType.character, assetId, applyToAssetRecord),
      scene: updateAssetRecordBucket(previousProjectDetail.assetsByType.scene, assetId, applyToAssetRecord),
      prop: updateAssetRecordBucket(previousProjectDetail.assetsByType.prop, assetId, applyToAssetRecord),
    };
    const nextProjectDetail = {
      ...previousProjectDetail,
      assetsByType: nextAssetsByType,
    };
    workbench.state = {
      ...(workbench.state ?? {}),
      projectDetail: nextProjectDetail,
    };
    workbench.ui.projectDetail = nextProjectDetail;
  }

  const draft = workbench.ui.assetPromptDraft;
  if (draft?.selectionContext?.selectedAssetId && String(draft.selectionContext.selectedAssetId) === String(assetId)) {
    workbench.ui.assetPromptDraft = {
      ...draft,
      selectionContext: {
        ...draft.selectionContext,
        selectedAssetDescription: description,
      },
      quickReferenceItems: (draft.quickReferenceItems ?? []).map((item) =>
        matchesAssetRecordId(item, assetId) ? { ...item, description, promptPreview: description } : item,
      ),
      mentionReferences: (draft.mentionReferences ?? []).map((item) =>
        matchesAssetRecordId(item, assetId) ? { ...item, description, promptPreview: description } : item,
      ),
    };
  }
}

function syncProjectAssetNameState(workbench, assetKind, assetId, name) {
  const applyToAssetRecord = (record) => {
    const nextLatestVersionMetadata =
      record?.latestVersion?.metadata && typeof record.latestVersion.metadata === "object"
        ? { ...record.latestVersion.metadata, label: name }
        : record?.latestVersion
          ? { label: name }
          : record?.latestVersion?.metadata;
    return {
      ...record,
      name,
      label: name,
      latestVersion: record?.latestVersion
        ? {
            ...record.latestVersion,
            metadata: nextLatestVersionMetadata,
          }
        : record?.latestVersion,
    };
  };

  const nextImportedAssets = cloneImportedAssets(workbench.ui.importedAssets);
  if (assetKind === "other") {
    const mediaType = workbench.ui.projectOtherAssetMediaType ?? "image";
    nextImportedAssets.other[mediaType] = updateAssetRecordBucket(
      nextImportedAssets.other[mediaType],
      assetId,
      applyToAssetRecord,
    );
  } else {
    nextImportedAssets[assetKind] = updateAssetRecordBucket(
      nextImportedAssets[assetKind],
      assetId,
      applyToAssetRecord,
    );
  }
  workbench.ui.importedAssets = nextImportedAssets;

  const previousContext = workbench.ui.episodeWorkbenchContext;
  if (previousContext && typeof previousContext === "object") {
    const nextContext = structuredClone(previousContext);
    const contextRoots = [nextContext, nextContext?.data].filter((value) => value && typeof value === "object");
    for (const root of contextRoots) {
      for (const bucketName of ["assetsByType", "assets", "episodeAssets"]) {
        const assetsByType = root?.[bucketName];
        if (!assetsByType || typeof assetsByType !== "object") {
          continue;
        }
        for (const kind of ["character", "characters", "role", "roles", "scene", "scenes", "prop", "props"]) {
          if (kind in assetsByType) {
            assetsByType[kind] = updateAssetRecordBucket(assetsByType[kind], assetId, applyToAssetRecord);
          }
        }
      }
    }
    workbench.ui.episodeWorkbenchContext = nextContext;
  }

  const previousProjectDetail = workbench.state?.projectDetail ?? workbench.ui.projectDetail ?? null;
  if (previousProjectDetail?.assetsByType && typeof previousProjectDetail.assetsByType === "object") {
    const nextAssetsByType = {
      ...previousProjectDetail.assetsByType,
      character: updateAssetRecordBucket(previousProjectDetail.assetsByType.character, assetId, applyToAssetRecord),
      scene: updateAssetRecordBucket(previousProjectDetail.assetsByType.scene, assetId, applyToAssetRecord),
      prop: updateAssetRecordBucket(previousProjectDetail.assetsByType.prop, assetId, applyToAssetRecord),
      other: previousProjectDetail.assetsByType.other
        ? {
            ...previousProjectDetail.assetsByType.other,
            image: updateAssetRecordBucket(previousProjectDetail.assetsByType.other.image, assetId, applyToAssetRecord),
            video: updateAssetRecordBucket(previousProjectDetail.assetsByType.other.video, assetId, applyToAssetRecord),
          }
        : previousProjectDetail.assetsByType.other,
    };
    const nextProjectDetail = {
      ...previousProjectDetail,
      assetsByType: nextAssetsByType,
    };
    workbench.state = {
      ...(workbench.state ?? {}),
      projectDetail: nextProjectDetail,
    };
    workbench.ui.projectDetail = nextProjectDetail;
  }

  const draft = workbench.ui.assetPromptDraft;
  if (draft?.selectionContext?.selectedAssetId && String(draft.selectionContext.selectedAssetId) === String(assetId)) {
    workbench.ui.assetPromptDraft = {
      ...draft,
      selectionContext: {
        ...draft.selectionContext,
        selectedAssetName: name,
      },
      quickReferenceItems: (draft.quickReferenceItems ?? []).map((item) =>
        matchesAssetRecordId(item, assetId) ? { ...item, name } : item,
      ),
      mentionReferences: (draft.mentionReferences ?? []).map((item) =>
        matchesAssetRecordId(item, assetId) ? { ...item, name } : item,
      ),
    };
  }
}

function syncEpisodeAssetFixedImageState(workbench, assetId, payload = {}) {
  const previewUrl = String(payload.previewUrl ?? "").trim();
  if (!assetId || !previewUrl) {
    return;
  }
  const sourceUrl = String(payload.sourceUrl ?? previewUrl).trim() || previewUrl;
  const downloadUrl = String(payload.downloadUrl ?? sourceUrl).trim() || sourceUrl;
  const fixedImageFileId = payload.fixedImageFileId ?? payload.assetVersionId ?? null;
  const fixedImageStorageObjectId = payload.fixedImageStorageObjectId ?? payload.storageObjectId ?? null;
  const mimeType = payload.mimeType ?? null;
  const updatedAt = payload.updatedAt ?? null;
  const applyToAssetRecord = (record) => {
    const nextLatestVersionMetadata =
      record?.latestVersion?.metadata && typeof record.latestVersion.metadata === "object"
        ? { ...record.latestVersion.metadata }
        : {};
    nextLatestVersionMetadata.previewUrl = previewUrl;
    nextLatestVersionMetadata.sourceUrl = sourceUrl;
    nextLatestVersionMetadata.downloadUrl = downloadUrl;
    nextLatestVersionMetadata.fixedImageUrl = previewUrl;
    nextLatestVersionMetadata.fixedImageFileId = fixedImageFileId;
    nextLatestVersionMetadata.fixedImageStorageObjectId = fixedImageStorageObjectId;
    if (mimeType) {
      nextLatestVersionMetadata.mimeType = mimeType;
    }
    return {
      ...record,
      preview: previewUrl,
      previewUrl,
      sourceUrl,
      downloadUrl,
      updatedAt: updatedAt ?? record?.updatedAt ?? null,
      fixedImageFileId: fixedImageFileId ?? record?.fixedImageFileId ?? null,
      fixedImageStorageObjectId: fixedImageStorageObjectId ?? record?.fixedImageStorageObjectId ?? null,
      fixedImageUrl: previewUrl,
      latestVersion: record?.latestVersion
        ? {
            ...record.latestVersion,
            storageObjectId: fixedImageStorageObjectId ?? record.latestVersion.storageObjectId ?? null,
            previewUrl,
            metadata: nextLatestVersionMetadata,
          }
        : record?.latestVersion,
    };
  };

  const nextImportedAssets = cloneImportedAssets(workbench.ui.importedAssets);
  for (const kind of ["character", "scene", "prop"]) {
    nextImportedAssets[kind] = updateAssetRecordBucket(nextImportedAssets[kind], assetId, applyToAssetRecord);
  }
  workbench.ui.importedAssets = nextImportedAssets;

  const previousContext = workbench.ui.episodeWorkbenchContext;
  if (previousContext && typeof previousContext === "object") {
    const nextContext = structuredClone(previousContext);
    const contextRoots = [nextContext, nextContext?.data].filter((value) => value && typeof value === "object");
    for (const root of contextRoots) {
      for (const bucketName of ["assetsByType", "assets", "episodeAssets"]) {
        const assetsByType = root?.[bucketName];
        if (!assetsByType || typeof assetsByType !== "object") {
          continue;
        }
        for (const kind of ["character", "characters", "role", "roles", "scene", "scenes", "prop", "props"]) {
          if (kind in assetsByType) {
            assetsByType[kind] = updateAssetRecordBucket(assetsByType[kind], assetId, applyToAssetRecord);
          }
        }
      }
    }
    workbench.ui.episodeWorkbenchContext = nextContext;
  }

  const previousProjectDetail = workbench.state?.projectDetail ?? workbench.ui.projectDetail ?? null;
  if (previousProjectDetail?.assetsByType && typeof previousProjectDetail.assetsByType === "object") {
    const nextAssetsByType = {
      ...previousProjectDetail.assetsByType,
      character: updateAssetRecordBucket(previousProjectDetail.assetsByType.character, assetId, applyToAssetRecord),
      scene: updateAssetRecordBucket(previousProjectDetail.assetsByType.scene, assetId, applyToAssetRecord),
      prop: updateAssetRecordBucket(previousProjectDetail.assetsByType.prop, assetId, applyToAssetRecord),
    };
    const nextProjectDetail = {
      ...previousProjectDetail,
      assetsByType: nextAssetsByType,
    };
    workbench.state = {
      ...(workbench.state ?? {}),
      projectDetail: nextProjectDetail,
    };
    workbench.ui.projectDetail = nextProjectDetail;
  }
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

function firstUuidLikeValue(...values) {
  return values.map((value) => String(value ?? "").trim()).find((value) => isUuidLike(value)) ?? null;
}

function isMockImageUrl(value) {
  return /mock-image-[^?]+\.(?:avif|png|webp)(?:\?|$)/i.test(String(value ?? "").trim());
}

function resolvePreferredFixedImageUrl(...candidates) {
  const normalized = candidates
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  const realCandidate = normalized.find((value) => !isMockImageUrl(value));
  return realCandidate ?? normalized[0] ?? "";
}

function resolveLatestAssetConversationPreview(historyMap = {}, assetId) {
  const normalizedAssetId = String(assetId ?? "").trim();
  if (!normalizedAssetId) {
    return "";
  }
  const candidateEntries = Object.entries(historyMap).flatMap(([key, entries]) => {
    if (!String(key).includes(normalizedAssetId) || !Array.isArray(entries)) {
      return [];
    }
    return entries;
  });
  for (let index = candidateEntries.length - 1; index >= 0; index -= 1) {
    const entry = candidateEntries[index];
    const fixedImage = Array.isArray(entry?.fixedImages) ? entry.fixedImages.find((item) => item?.url) : null;
    const generatedImage = Array.isArray(entry?.images) ? entry.images.find((item) => item?.url) : null;
    const preview = resolvePreferredFixedImageUrl(
      fixedImage?.url,
      generatedImage?.url,
      entry?.file?.previewUrl,
      entry?.asset?.fixedImageUrl,
    );
    if (preview) {
      return preview;
    }
  }
  return "";
}

function applyAssetConversationPreviewFallback(assets = [], historyMap = {}) {
  return (Array.isArray(assets) ? assets : []).map((asset) => {
    const preferredPreview = resolvePreferredFixedImageUrl(
      asset?.preview,
      asset?.previewUrl,
      asset?.fixedImageUrl,
      asset?.latestVersion?.previewUrl,
      asset?.latestVersion?.metadata?.fixedImageUrl,
      asset?.latestVersion?.metadata?.previewUrl,
      asset?.sourceUrl,
    );
    if (preferredPreview && !isMockImageUrl(preferredPreview)) {
      return {
        ...asset,
        preview: preferredPreview,
        previewUrl: preferredPreview,
        fixedImageUrl: preferredPreview,
      };
    }
    const conversationPreview = resolveLatestAssetConversationPreview(historyMap, asset?.assetId ?? asset?.id ?? null);
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

function preserveRealEpisodeAssetPreviews(existingAssets = [], nextAssets = []) {
  const existingById = new Map();
  for (const asset of Array.isArray(existingAssets) ? existingAssets : []) {
    const keys = [asset?.assetId, asset?.id]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean);
    for (const key of keys) {
      existingById.set(key, asset);
    }
  }
  return (Array.isArray(nextAssets) ? nextAssets : []).map((asset) => {
    const nextPreview = resolvePreferredFixedImageUrl(
      asset?.preview,
      asset?.previewUrl,
      asset?.fixedImageUrl,
      asset?.sourceUrl,
    );
    if (nextPreview && !isMockImageUrl(nextPreview)) {
      return asset;
    }
    const match =
      existingById.get(String(asset?.assetId ?? "").trim()) ??
      existingById.get(String(asset?.id ?? "").trim()) ??
      null;
    if (!match) {
      return asset;
    }
    const existingPreview = resolvePreferredFixedImageUrl(
      match?.preview,
      match?.previewUrl,
      match?.fixedImageUrl,
      match?.sourceUrl,
    );
    if (!existingPreview || isMockImageUrl(existingPreview)) {
      return asset;
    }
    return {
      ...asset,
      preview: existingPreview,
      previewUrl: existingPreview,
      fixedImageUrl: existingPreview,
    };
  });
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
    workbench.ui.toast = "当前分镜没有可下载的图片。";
    return;
  }

  triggerAssetDownload(
    image.src,
    stripFileExtension(image.fileName || storyboard?.title || "storyboard-image"),
    inferFileExtension(image.fileName || image.src, "png"),
  );
  workbench.ui.toast = `已开始下载 ${image.fileName || storyboard.uploadedImageName || "分镜图片"}。`;
}

function legacyDeleteStoryboardImage(workbench, storyboardId, imageId = "") {
  const storyboard = getActiveStoryboards(workbench).find((item) => item.id === storyboardId);
  const image = findStoryboardImage(storyboard, imageId);
  if (!image?.src || !image?.id) {
    workbench.ui.toast = "当前分镜没有可删除的图片。";
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
  workbench.ui.toast = "已移除当前分镜图片。";
}

function downloadStoryboardVideo(workbench, storyboardId, videoId) {
  const storyboard = getActiveStoryboards(workbench).find((item) => item.id === storyboardId);
  const video = (storyboard?.uploadedVideos ?? []).find((item) => item.id === videoId && item.src);
  if (!video?.src) {
    workbench.ui.toast = "当前分镜没有可下载的视频。";
    return;
  }

  triggerAssetDownload(
    video.src,
    stripFileExtension(video.fileName || `${storyboard?.title || "storyboard-video"}`),
    inferFileExtension(video.fileName || video.src, "mp4"),
  );
  workbench.ui.toast = `已开始下载 ${video.fileName || "分镜视频"}。`;
}

function legacyDeleteStoryboardVideo(workbench, storyboardId, videoId) {
  if (!storyboardId || !videoId) {
    return;
  }

  const storyboard = getActiveStoryboards(workbench).find((item) => item.id === storyboardId);
  const video = (storyboard?.uploadedVideos ?? []).find((item) => item.id === videoId);
  if (!video) {
    workbench.ui.toast = "当前分镜没有可删除的视频。";
    return;
  }

  cancelStoryboardVideoUpload(workbench, storyboardId, videoId);
  clearStoryboardVideoFromState(workbench, storyboard?.linkedShotId ?? null, videoId);
  workbench.ui.toast = `已移除 ${video.fileName || "分镜视频"}。`;
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
    workbench.ui.toast = "当前视频正在使用中，无法直接删除。";
    render(workbench);
    return;
  }

  const video = (storyboard?.uploadedVideos ?? []).find((item) => item.id === videoId);
  if (!video) {
    workbench.ui.toast = "未找到要删除的视频。";
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
    workbench.ui.toast = "正在删除分镜视频...";
    render(workbench);
    try {
      const result = await workbench.api.deleteShotMedia(storyboard.linkedShotId, {
        kind: "video",
        assetVersionId: videoId,
      });
      applyLocalRemoval();
      if (result?.missing) {
        persistWorkbenchState(workbench);
        workbench.ui.toast = "视频记录已不存在，已同步清理本地状态。";
        return;
      }
      await refresh(workbench);
      workbench.ui.toast = "已删除分镜视频。";
    } catch (error) {
      workbench.ui.toast = `删除分镜视频失败：${friendlyError(error)}`;
    } finally {
      workbench.ui.busy = false;
      render(workbench);
    }
    return;
  }

  applyLocalRemoval();
  persistWorkbenchState(workbench);
  workbench.ui.toast = `已删除 ${video.fileName || "当前视频"}。`;
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
  return `第 ${nextIndex} 集`;
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

  const candidate = normalized.replace(/[，。！？、…,.!? ]+$/g, "").trim();
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

function createTeamMemberDraft() {
  return {
    teamAccount: "",
    displayName: "",
    businessRole: "director",
    initialCredits: 0,
    remark: "",
  };
}

const TEAM_DASHBOARD_TABS = new Set(["member-consumption", "project-cost", "ranking"]);
const TEAM_DASHBOARD_DATE_RANGES = new Set([
  "today",
  "yesterday",
  "week",
  "month",
  "last-month",
  "year",
]);

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
  const teamMessage = teamErrorMessage(errorCode);
  if (teamMessage) {
    return teamMessage;
  }
  if (errorCode === "origin_forbidden") {
    return `跨域来源被拒绝，请从允许的地址打开页面或检查 CORS 配置${requestId}`;
  }
  const modelMessage = modelGenerationErrorMessage(errorCode);
  if (modelMessage) {
    return `${modelMessage}${requestId}`;
  }
  const message =
    error instanceof Error ? error.message : (typeof error?.message === "string" ? error.message : String(error));
  if (
    errorCode === "unexpected_response" ||
    error instanceof SyntaxError ||
    message.includes("Unexpected token")
  ) {
    return `服务返回异常，请刷新页面或重新登录。${requestId}`;
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
  const teamMessageFromBody = teamErrorMessage(message);
  if (teamMessageFromBody) {
    return teamMessageFromBody;
  }
  return (
    {
      ASSET_ALREADY_EXISTS: "已存在该资源图片",
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

function modelGenerationErrorMessage(value) {
  return (
    {
      model_reference_limit_exceeded: "参考素材数量超出模型限制",
      model_reference_not_found: "参考素材不存在或无权访问",
      model_reference_unavailable: "参考素材尚未准备好，请重新选择",
      model_reference_mime_not_allowed: "当前模型不支持该参考素材格式",
      model_prompt_too_long: "提示词过长，请缩短后重试",
      model_not_configured: "模型不可用，请切换模型",
      model_disabled: "当前模型维护中，请切换模型",
      model_task_mode_unsupported: "当前模型不支持该生成方式",
      model_media_type_mismatch: "当前模型类型不匹配",
      insufficient_credits: "积分不足，请充值后再生成",
    }[String(value ?? "")] ?? ""
  );
}

function teamErrorMessage(value) {
  const text = String(value ?? "");
  if (!text) {
    return "";
  }
  if (text.includes("team_member_limit")) {
    return "团队成员数量已达上限，请升级或调整席位后重试。";
  }
  if (text.includes("team_permission_denied")) {
    return "当前账号没有团队管理权限，请联系管理员。";
  }
  if (text.includes("billing_required")) {
    return "该团队能力需要开通专业版后使用。";
  }
  return "";
}

function buildManualAssetDefaultDescription(kind, name) {
  if (kind === "scene") {
    return `这是刚添加的${name}`;
  }
  if (kind === "prop") {
    return `这是刚添加的${name}`;
  }
  return "自己的角色描述，随意更改";
}

function findEpisodeAssetById(workbench, kind, assetId) {
  const groups = resolvePromptMentionAssetBuckets(workbench);
  return (groups?.[kind] ?? []).find((item) => item.id === assetId || item.assetId === assetId) ?? null;
}

function applyManualAssetDraftDefaults(workbench, kind, assetId, name) {
  if (!assetId) {
    return;
  }
  const description = buildManualAssetDefaultDescription(kind, name);
  const groups = cloneImportedAssets(workbench.ui.importedAssets);
  groups[kind] = (groups[kind] ?? []).map((item) => {
    if (item.id !== assetId && item.assetId !== assetId) {
      return item;
    }
    return {
      ...item,
      description: item.description || description,
      voiceName: kind === "character" ? (item.voiceName ?? "") : item.voiceName,
      voiceSource: kind === "character" ? (item.voiceSource ?? "custom") : item.voiceSource,
    };
  });
  workbench.ui.importedAssets = groups;
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
  if (token === "team" || token.startsWith("team-dashboard")) {
    return "team";
  }
  return "project";
}

function deriveInitialLibraryTeamRoute(hash) {
  const token = String(hash || "").replace(/^#/, "");
  if (token.startsWith("team-dashboard")) {
    return "team-dashboard";
  }
  if (token === "team") {
    return "team";
  }
  return "assets";
}

function normalizeTeamDashboardTab(tab) {
  const normalizedTab = String(tab ?? "");
  return TEAM_DASHBOARD_TABS.has(normalizedTab) ? normalizedTab : "member-consumption";
}

function normalizeTeamDashboardDateRange(range) {
  const normalizedRange = String(range ?? "");
  return TEAM_DASHBOARD_DATE_RANGES.has(normalizedRange) ? normalizedRange : "today";
}

function deriveInitialTeamDashboardTab(hash) {
  const token = String(hash || "").replace(/^#/, "");
  if (token === "team-dashboard-project-cost") {
    return "project-cost";
  }
  if (token === "team-dashboard-ranking") {
    return "ranking";
  }
  return "member-consumption";
}

function teamDashboardHash(tab) {
  const normalizedTab = normalizeTeamDashboardTab(tab);
  return normalizedTab === "member-consumption" ? "team-dashboard" : `team-dashboard-${normalizedTab}`;
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

function buildOriginalScriptPlanSeed(draft = {}) {
  const name = String(draft.fileName ?? "").trim() || "未命名原创项目";
  const audience = String(draft.audience ?? "女频").trim();
  const genre = String(draft.genre ?? "逆袭虐感").trim();
  const episodeCount = String(draft.episodeCount ?? "").trim();
  const cardSetting = String(draft.cardSetting ?? "自动分卡").trim();
  const episodeLength = String(draft.episodeLength ?? "约 1 分钟").trim();
  const inspiration = String(draft.inspiration ?? "").trim();

  return `${name}

项目模式：AI 原创剧本
目标受众：${audience}
题材看点：${genre}
拆分集数：${episodeCount}
分卡设置：${cardSetting}
每集长度：${episodeLength}

创作灵感：
${inspiration}`;
}

export function applyProjectDetail(workbench, detail) {
  const normalizedDetail = normalizeProjectDetailContract(detail);
  if (!normalizedDetail?.project) {
    return;
  }
  const previousEpisodeId = workbench?.ui?.selectedEpisodeId ?? null;
  const shouldPreserveEpisodeAssets =
    workbench?.ui?.projectPanelMode === "episode-workbench" &&
    hasPersistedEpisodeWorkbenchId(workbench, previousEpisodeId);
  workbench.state = {
    ...(workbench.state ?? {}),
    project: normalizedDetail.project,
    script: normalizedDetail.script ?? null,
    shots: normalizedDetail.shots ?? [],
    projectDetail: normalizedDetail,
  };
  workbench.ui.projectDetail = normalizedDetail;
  workbench.ui.exportHistory = normalizedDetail.exportHistory ?? workbench.ui.exportHistory ?? [];
  if (!shouldPreserveEpisodeAssets) {
    workbench.ui.importedAssets = mapProjectDetailAssets(normalizedDetail.assetsByType);
  }
  workbench.ui.customEpisodes = getDetailEpisodes(workbench.state);
  if (
    workbench?.ui?.projectPanelMode === "episode-workbench" &&
    previousEpisodeId &&
    previousEpisodeId !== "episode-primary" &&
    !hasPersistedEpisodeWorkbenchId(workbench, previousEpisodeId)
  ) {
    workbench.ui.selectedEpisodeId = resolvePersistedEpisodeWorkbenchId(workbench, previousEpisodeId);
    workbench.ui.selectedEpisodeAssetId = null;
    workbench.ui.selectedEpisodeCardId = null;
    workbench.ui.selectedEpisodeAssetIds = [];
    workbench.ui.imageGenerationResult = null;
    workbench.ui.videoGenerationResult = null;
  }
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
  const apiStoryboardId =
    firstUuidLikeValue(storyboard?.storyboardId, storyboard?.shotId, storyboard?.linkedShotId, storyboard?.id) ??
    null;
  const storyboardId =
    apiStoryboardId ??
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
  const previewThumbnailUrl =
    storyboard?.previewThumbnailUrl ??
    storyboard?.currentVideoThumbnailUrl ??
    storyboard?.currentVideo?.thumbnailUrl ??
    null;
  const generationDrafts = normalizeEpisodeStoryboardGenerationDrafts(storyboard?.generationDrafts);
  const videoDraft = generationDrafts.find((draft) => draft.mode === "video") ?? null;
  const imageDraft = generationDrafts.find((draft) => draft.mode === "image") ?? null;
  const activeDraft = videoDraft ?? imageDraft;
  return {
    id: storyboardId,
    linkedShotId: apiStoryboardId ?? storyboard?.linkedShotId ?? storyboard?.shotId ?? storyboard?.storyboardId ?? storyboardId,
    episodeId: storyboard?.episodeId ?? null,
    index: Number(storyboard?.index ?? storyboard?.indexNo ?? storyboard?.sortOrder ?? 1),
    title: storyboard?.title ?? String(storyboard?.indexNo ?? storyboard?.sortOrder ?? 1),
    description: storyboard?.description ?? storyboard?.sceneAnalysis ?? storyboard?.plotPreview ?? "",
    sceneAnalysis: storyboard?.sceneAnalysis ?? "",
    plotPreview: storyboard?.plotPreview ?? "",
    previewImageUrl,
    previewVideo,
    previewUrl: previewVideo ?? previewImageUrl,
    previewThumbnailUrl,
    imageStatus: previewImageUrl ? "ready" : "empty",
    videoStatus: previewVideo ? "ready" : "empty",
    currentImageAssetVersionId: storyboard?.currentImageFileId ?? storyboard?.currentImageAssetVersionId ?? null,
    currentVideoAssetVersionId: storyboard?.currentVideoFileId ?? storyboard?.currentVideoAssetVersionId ?? null,
    uploadedImages: previewImageUrl
      ? [{ id: storyboard?.currentImageFileId ?? `${storyboardId}-image`, src: previewImageUrl, status: "ready" }]
      : [],
    uploadedVideos: previewVideo
      ? [{
          id: storyboard?.currentVideoFileId ?? `${storyboardId}-video`,
          src: previewVideo,
          thumbnailSrc: previewThumbnailUrl,
          status: "ready",
        }]
      : [],
    generationDrafts,
    imagePromptDraft: imageDraft,
    videoPromptDraft: videoDraft,
    generationState: {
      ...createEmptyGenerationState(),
      prompt: activeDraft?.prompt ?? "",
      imagePrompt: imageDraft?.prompt ?? "",
      videoPrompt: videoDraft?.prompt ?? "",
    },
  };
}

function normalizeEpisodeStoryboardGenerationDrafts(drafts) {
  if (!Array.isArray(drafts)) {
    return [];
  }
  return drafts
    .map((draft) => {
      const mode = String(draft?.mode ?? "").trim();
      if (mode !== "image" && mode !== "video" && mode !== "lip_sync") {
        return null;
      }
      return {
        mode,
        prompt: String(draft?.prompt ?? ""),
        payload: draft?.payload && typeof draft.payload === "object" ? draft.payload : {},
        updatedAt: draft?.updatedAt ?? null,
      };
    })
    .filter(Boolean);
}

function mapEpisodeAssetContracts(assets = [], kind) {
  return [...assets].map((asset) => {
    const resolvedPreview = resolvePreferredFixedImageUrl(
      asset?.fixedImageUrl,
      asset?.previewUrl,
      asset?.latestVersion?.previewUrl,
      asset?.latestVersion?.metadata?.fixedImageUrl,
      asset?.latestVersion?.metadata?.previewUrl,
      asset?.sourceUrl,
    );
    return {
      id: asset?.assetId ?? asset?.id ?? `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      assetId: asset?.assetId ?? asset?.id ?? null,
      name: asset?.name ?? asset?.label ?? "未命名资产",
      preview: resolvedPreview,
      previewUrl: resolvedPreview,
      description: resolveEpisodeAssetDescription(asset),
      kind,
      source: "episode",
      assetSource: "episode",
      voiceId: asset?.voiceId ?? null,
      voiceName: asset?.voiceName ?? "",
      voiceSource: asset?.voiceSource ?? inferEpisodeVoiceSource(asset),
      dubbingConfig: asset?.dubbingConfig ?? null,
      updatedAt: asset?.updatedAt ?? null,
      fixedImageFileId: asset?.fixedImageFileId ?? null,
      fixedImageUrl: resolvedPreview,
      fixedImageStorageObjectId: asset?.fixedImageStorageObjectId ?? null,
    };
  });
}

function resolveEpisodeAssetDescription(asset) {
  return normalizeEpisodeAssetDescriptionText(
    asset?.description ??
      asset?.latestVersion?.metadata?.description ??
      asset?.metadata?.description ??
      asset?.promptPreview ??
      asset?.prompt ??
      "",
  );
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
    description: normalizeEpisodeAssetDescriptionText(asset.latestVersion?.metadata?.description ?? asset.assetKey ?? ""),
    kind,
    isMain: Boolean(asset.latestVersion?.metadata?.isMain),
    assetSource: asset.latestVersion?.metadata?.source ?? "import",
    updatedAt: asset.updatedAt ?? asset.latestVersion?.createdAt ?? asset.createdAt ?? null,
    latestVersion: asset.latestVersion ?? null,
    source: asset.latestVersion?.metadata?.source ?? "import",
  }));
}

function normalizeEpisodeAssetDescriptionText(value) {
  const lines = String(value ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const values = [];
  for (const line of lines) {
    if (containsComparableEpisodeAssetText(values, line)) {
      continue;
    }
    for (let index = values.length - 1; index >= 0; index -= 1) {
      if (includesComparableEpisodeAssetText(line, values[index])) {
        values.splice(index, 1);
      }
    }
    values.push(line);
  }
  return values.join("\n");
}

function containsComparableEpisodeAssetText(values, candidate) {
  return values.some((value) => includesComparableEpisodeAssetText(value, candidate));
}

function includesComparableEpisodeAssetText(container, candidate) {
  const normalizedContainer = normalizeComparableEpisodeAssetText(container);
  const normalizedCandidate = normalizeComparableEpisodeAssetText(candidate);
  return Boolean(normalizedCandidate && normalizedContainer.includes(normalizedCandidate));
}

function normalizeComparableEpisodeAssetText(value) {
  return String(value ?? "").replace(/\s+/g, "");
}

function seedImportedEpisodeAssets(workbench, assetKind, importedAssets = []) {
  if (!isRealEpisodeWorkbench(workbench) || assetKind === "other" || !importedAssets.length) {
    return;
  }
  const nextImportedAssets = cloneImportedAssets(workbench.ui.importedAssets);
  const currentAssets = Array.isArray(nextImportedAssets[assetKind]) ? nextImportedAssets[assetKind] : [];
  const existingKeys = new Set(
    currentAssets.flatMap((asset) =>
      [asset?.assetId, asset?.id].map((value) => String(value ?? "").trim()).filter(Boolean),
    ),
  );
  for (const asset of importedAssets) {
    const keys = [asset?.assetId, asset?.id].map((value) => String(value ?? "").trim()).filter(Boolean);
    if (keys.some((key) => existingKeys.has(key))) {
      continue;
    }
    currentAssets.push(asset);
    for (const key of keys) {
      existingKeys.add(key);
    }
  }
  nextImportedAssets[assetKind] = currentAssets;
  workbench.ui.importedAssets = nextImportedAssets;
}

function resolveAssetImportLibraryRecords(workbench, assetKind) {
  const libraryAssets = assetKind === "character"
    ? workbench.ui.projectLibraryAssetsByType?.character ?? []
    : assetKind === "scene"
      ? workbench.ui.projectLibraryAssetsByType?.scene ?? []
      : assetKind === "prop"
        ? workbench.ui.projectLibraryAssetsByType?.prop ?? []
        : [];
  if (libraryAssets.length) {
    return libraryAssets.map((asset) => ({
      id: asset.id,
      name: asset.label ?? asset.assetKey ?? "未命名资产",
      preview: asset.previewUrl ?? asset.latestVersion?.previewUrl ?? "",
      previewDataUrl: asset.previewUrl ?? asset.latestVersion?.previewUrl ?? "",
      mimeType: asset.latestVersion?.metadata?.mimeType ?? "image/png",
      width: Number(asset.latestVersion?.metadata?.width ?? 240),
      height: Number(asset.latestVersion?.metadata?.height ?? 240),
      storageObjectId: asset.latestVersion?.storageObjectId ?? null,
      storageObjectKey: asset.latestVersion?.storageObjectKey ?? "",
      sourceUrl:
        asset.latestVersion?.metadata?.sourceUrl ??
        asset.latestVersion?.previewUrl ??
        asset.previewUrl ??
        "",
      sourceAssetId: asset.id,
      source: "library",
    }));
  }
  return [];
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
  await syncProjectLibraryAssets(workbench);
}

async function refreshProjectLibraryIfAvailable(workbench) {
  if (typeof workbench.api?.getProjects !== "function") {
    return;
  }
  await syncProjectLibraryFromApi(workbench);
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

function shouldPrefetchReusableAssetLibrary(workbench) {
  return (
    workbench.ui.activeNavTab === "library" &&
    (workbench.ui.libraryTeamRoute ?? "assets") === "assets" &&
    shouldFetchAssetLibrary(workbench)
  );
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

function groupLibraryAssetsByType(assets = []) {
  const grouped = {
    character: [],
    scene: [],
    prop: [],
    other: {
      image: [],
      video: [],
    },
  };

  for (const asset of Array.isArray(assets) ? assets : []) {
    const normalized = {
      ...asset,
      previewUrl: asset?.previewUrl ?? asset?.latestVersion?.previewUrl ?? "",
    };
    if (asset?.assetType === "character_sheet") {
      grouped.character.push(normalized);
    } else if (asset?.assetType === "scene_reference") {
      grouped.scene.push(normalized);
    } else if (asset?.assetType === "prop_reference") {
      grouped.prop.push(normalized);
    } else if (asset?.assetType === "shot_video") {
      grouped.other.video.push(normalized);
    } else {
      grouped.other.image.push(normalized);
    }
  }

  return grouped;
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
      summary: "已引用当前分镜图片",
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
      summary: "已选择当前分镜视频",
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
    workbench.ui.selectedModelId = resolveConfiguredVideoModelCode(workbench, "first-frame", "seedance-i2v-pro");
    syncGenerationStateFromStoryboardImage(workbench, storyboardId);
    workbench.ui.prompt = workbench.ui.prompt || buildSuggestedPrompt(storyboard, { episodeMediaMode: "video" });
    workbench.ui.toast = "已切换到图片生成视频模式。";
    return;
  }

  if (action === "storyboard-image-edit") {
    workbench.ui.episodeMediaMode = "image";
    workbench.ui.imageGenerationMode = "single-image";
    workbench.ui.selectedModelId = resolveConfiguredImageModelCode(workbench, "single-image", "gpt-image-2-cn");
    setImageReferenceFromStoryboard(workbench, storyboardId);
    workbench.ui.prompt = workbench.ui.prompt || buildSuggestedPrompt(storyboard, { episodeMediaMode: "image" });
    workbench.ui.toast = "已带入当前分镜图片，进入文字改图模式。";
    return;
  }

  if (action === "storyboard-image-multi-view") {
    workbench.ui.episodeMediaMode = "image";
    workbench.ui.imageGenerationMode = "multi-image";
    workbench.ui.selectedModelId = resolveConfiguredImageModelCode(workbench, "multi-image", "gpt-image-2-cn");
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
    workbench.ui.toast = "正在删除分镜图片...";
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

export function mapEpisodeAssetContractsForTest(assets = [], kind = "character") {
  return mapEpisodeAssetContracts(assets, kind);
}
