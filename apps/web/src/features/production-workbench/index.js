import { renderProjectDetail } from "./project-detail.js";
import {
  addStoryboard,
  createEmptyGenerationState,
  createStoryboardList,
  getSelectedStoryboard,
  normalizeStoryboardIndices,
  sortStoryboardsByIndex,
} from "./storyboard-state.js";
import { validateVideoGeneration } from "./video-generation-panel.js";
import { resolveApiUrl } from "../../shared/creator-api.js";

const DEFAULT_SCRIPT = `Episode 1: Dawn over the mechanical city.

The lead mechanist opens the tower window, sees the industrial skyline, and prepares to launch the first test frame.`;

export function renderProductionWorkbench(context = {}) {
  return renderProjectDetail(context);
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

  const merged = current.map((storyboard) => {
    const synced =
      (storyboard.linkedShotId ? nextByShotId.get(storyboard.linkedShotId) : null) ??
      nextById.get(storyboard.id) ??
      null;

    if (!synced) {
      return storyboard;
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
    return {
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
    };
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
      ? currentVideos.filter((video) => video.status === "uploading")
      : currentVideos;
  }

  const mergedVideos = (preserveUploadingOnly
    ? currentVideos.filter((video) => video.status === "uploading")
    : currentVideos
  ).map((video) => ({ ...video }));
  const currentVideoIndexById = new Map(mergedVideos.map((video, index) => [video.id, index]));

  nextVideos.forEach((video) => {
    const matchedIndex = currentVideoIndexById.get(video.id);
    if (matchedIndex == null) {
      mergedVideos.push({
        ...video,
        thumbnailSrc: video.thumbnailSrc ?? null,
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

  return mergedVideos;
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
      assetGeneratorName: "闁惧爼娼版鎴濓紜2(1)",
      assetGeneratorPrompt: "",
      assetGeneratorCharacterType: "human",
      assetGeneratorStyleValue: "閺冪娀顥撻弽? 閺堫偂绗橀悳鍕",
      assetGeneratorStyleCategory: "official",
      assetGeneratorStyleOption: "none",
      assetGeneratorMaterialCategory: "official",
      assetGeneratorMaterialOption: "fantasy-doomsday",
      assetGeneratorImageType: "main",
      assetGeneratorModel: "閸楄櫕鈪?.0",
      assetGeneratorResolution: "2K",
      assetGeneratorCount: 1,
      renameImportedAsset: null,
      renameImportedAssetName: "",
      renameImportedAssetNotice: "",
      deleteImportedAsset: null,
      customEpisodes: [],
      selectedEpisodeId: null,
      episodeStoryboardMap: {},
      episodeMediaMode: "image",
      videoGenerationMode: "first-frame",
      imageGenerationMode: "single-image",
      isSingleEpisodeModalOpen: false,
      singleEpisodeName: "",
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
      scriptTab: "script-upload",
      scriptSubmitAction: "create-project",
      scriptSubmitLabel: "绾喛顓绘稉濠佺炊",
      uploadNotice: "",
      selectedModelId: "vidu-q3-pro",
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
      exportPreviewResult: null,
      isStoryboardDescriptionModalOpen: false,
      storyboardDescriptionDraft: "",
      episodeCardMenuId: null,
      activeNavTab: deriveInitialNavTab(window.location.hash),
      projectPanelMode: deriveInitialProjectPanelMode(window.location.hash),
    },
  };
  root.addEventListener("click", (event) => {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) {
      if (
        workbench.ui.assetCardMenuId ||
        workbench.ui.episodeCardMenuId ||
        workbench.ui.projectCardMenuId ||
        workbench.ui.isVideoModelMenuOpen ||
        workbench.ui.openGenerationSelectMenu ||
        workbench.ui.isFirstFrameMenuOpen ||
        workbench.ui.referenceAssetPickerKind
      ) {
        workbench.ui.assetCardMenuId = null;
        workbench.ui.episodeCardMenuId = null;
        workbench.ui.projectCardMenuId = null;
        workbench.ui.isVideoModelMenuOpen = false;
        workbench.ui.openGenerationSelectMenu = null;
        workbench.ui.isFirstFrameMenuOpen = false;
        workbench.ui.activeGenerationFrameMenu = null;
        workbench.ui.referenceAssetPickerKind = null;
        render(workbench);
      }
      return;
    }
    if (
      actionTarget.matches?.('input[data-action="upload-project-cover"]') ||
      actionTarget.matches?.(".asset-import-file-input")
    ) {
      return;
    }
    void handleAction(workbench, actionTarget).catch((error) => {
      workbench.ui.toast = `鎿嶄綔澶辫触锛?{friendlyError(error)}`;
      render(workbench);
    });
  });

  root.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    if (
      !workbench.ui.assetCardMenuId &&
      !workbench.ui.episodeCardMenuId &&
      !workbench.ui.projectCardMenuId &&
      !workbench.ui.isVideoModelMenuOpen &&
      !workbench.ui.openGenerationSelectMenu &&
      !workbench.ui.isFirstFrameMenuOpen &&
      !workbench.ui.activeGenerationFrameMenu &&
      !workbench.ui.referenceAssetPickerKind &&
      !workbench.ui.storyboardDeleteId
    ) {
      return;
    }
    workbench.ui.assetCardMenuId = null;
    workbench.ui.episodeCardMenuId = null;
    workbench.ui.projectCardMenuId = null;
    workbench.ui.isVideoModelMenuOpen = false;
    workbench.ui.openGenerationSelectMenu = null;
    workbench.ui.isFirstFrameMenuOpen = false;
    workbench.ui.activeGenerationFrameMenu = null;
    workbench.ui.referenceAssetPickerKind = null;
    workbench.ui.storyboardDeleteId = null;
    render(workbench);
  });

  root.addEventListener("change", async (event) => {
    const target = event.target;

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
      if (!file) {
        return;
      }

      const projectId = target.dataset.projectId ?? null;
      target.value = "";
      workbench.ui.projectCardMenuId = null;
      await runAction(workbench, "濮濓絽婀弴瀛樻煀妞ゅ湱娲扮亸渚€娼?..", async () => {
        const upload = await uploadLocalFile(workbench, file, "project-covers");
        await workbench.api.updateProjectCover({
          projectId,
          coverImageUrl: upload.publicUrl,
        });
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
    const zone = event.target?.closest?.('[data-dropzone="asset-import"]');
    if (!zone) {
      return;
    }
    event.preventDefault();
    zone.classList.add("is-dragging");
  });

  root.addEventListener("dragleave", (event) => {
    const zone = event.target?.closest?.('[data-dropzone="asset-import"]');
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
    const zone = event.target?.closest?.('[data-dropzone="asset-import"]');
    if (!zone) {
      return;
    }
    event.preventDefault();
    zone.classList.remove("is-dragging");
    const files = [...(event.dataTransfer?.files ?? [])];
    if (!files.length) {
      return;
    }
    await handleAssetImportFiles(workbench, files);
  });

  root.addEventListener("input", (event) => {
    const target = event.target;

    if (target?.matches?.("#video-prompt-input")) {
      workbench.ui.prompt = target.value;
      return;
    }

    if (target?.matches?.("#script-input")) {
      workbench.ui.defaultScript = target.value;
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

    if (target?.matches?.("#project-rename-name-input")) {
      workbench.ui.renameProjectName = target.value;
      if (workbench.ui.renameProjectNotice) {
        workbench.ui.renameProjectNotice = "";
      }
      const counter = workbench.root.querySelector(".rename-project-count");
      if (counter) {
        counter.textContent = `${[...target.value].length}`;
      }
      const notice = workbench.root.querySelector(".rename-project-actions .modal-inline-status");
      if (notice) {
        notice.textContent = "";
      }
      return;
    }

    if (target?.matches?.("#single-episode-name-input")) {
      workbench.ui.singleEpisodeName = target.value;
      if (workbench.ui.singleEpisodeNotice) {
        workbench.ui.singleEpisodeNotice = "";
      }
      const counter = workbench.root.querySelector(".single-episode-count");
      if (counter) {
        counter.textContent = `${[...target.value].length}/50`;
      }
      const notice = workbench.root.querySelector(".single-episode-actions .modal-inline-status");
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

    if (target?.matches?.('[data-action="search-projects"]')) {
      workbench.ui.projectSearchQuery = target.value;
      workbench.ui.projectLibraryPage = 1;
      render(workbench);
    }
  });

  await refresh(workbench);
  render(workbench);
}

async function refresh(workbench) {
  workbench.state = await workbench.api.getCreatorState();
  if (workbench.state?.project?.id) {
    try {
      applyProjectDetail(workbench, await workbench.api.getProjectDetail(workbench.state.project.id));
      await syncProjectInteriorSupplementary(workbench);
    } catch (error) {
      if (!String(error instanceof Error ? error.message : error).includes("project_not_found")) {
        throw error;
      }
    }
  }
  await syncProjectLibraryFromApi(workbench);
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
  syncWorkbenchRouteState(workbench, window.location.hash);
  syncSelectedStoryboardId(workbench, getActiveStoryboards(workbench, nextStoryboards));
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

function render(workbench) {
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
  persistWorkbenchState(workbench);
  applyPostRenderEffects(workbench);
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

async function handleAction(workbench, target) {
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
    workbench.ui.toast = "濮濓絽婀柅鈧崙铏规瑜?..";
    render(workbench);
    try {
      await workbench.onLogout?.();
    } catch (error) {
      workbench.ui.busy = false;
      workbench.ui.toast = `闁偓閸戣櫣娅ヨぐ鏇炪亼鐠愩儻绱?{friendlyError(error)}`;
      render(workbench);
    }
    return;
  }

  if (action === "set-nav-tab") {
    workbench.ui.activeNavTab = target.dataset.tab ?? "home";
    workbench.ui.projectPanelMode =
      workbench.ui.activeNavTab === "project" ? "library" : workbench.ui.projectPanelMode;
    workbench.ui.projectInteriorStatusMenuOpen = false;
    workbench.ui.toast = `Switched to ${navTabLabel(workbench.ui.activeNavTab)}.`;
    window.location.hash = workbench.ui.activeNavTab === "home" ? "home" : workbench.ui.activeNavTab;
    if (workbench.ui.activeNavTab === "project") {
      await syncProjectLibraryFromApi(workbench);
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
    workbench.ui.scriptSubmitLabel = "绾喛顓绘稉濠佺炊";
    workbench.ui.uploadNotice = "";
    render(workbench);
    return;
  }

  if (action === "close-script-modal") {
    workbench.ui.isScriptModalOpen = false;
    workbench.ui.scriptSubmitAction = "create-project";
    workbench.ui.scriptSubmitLabel = "绾喛顓绘稉濠佺炊";
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
    await runAction(workbench, "濮濓絽婀崚娑樼紦閸撗囨肠...", async () => {
      await workbench.api.createEpisode({
        projectId: workbench.ui.selectedProjectCardId,
        title: getNextEpisodeTitle(getDetailEpisodes(workbench.state)),
      });
      if (workbench.ui.selectedProjectCardId) {
        applyProjectDetail(
          workbench,
          await workbench.api.getProjectDetail(workbench.ui.selectedProjectCardId),
        );
      }
      workbench.ui.isScriptModalOpen = false;
      workbench.ui.scriptSubmitAction = "create-project";
      workbench.ui.scriptSubmitLabel = "绾喛顓绘稉濠佺炊";
      workbench.ui.uploadNotice = "";
      workbench.ui.episodeCardMenuId = null;
    });
    return;
  }

  if (action === "select-storyboard") {
    workbench.ui.selectedStoryboardId = target.dataset.storyboardId ?? null;
    workbench.ui.isStoryboardDescriptionModalOpen = false;
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
      workbench.ui.toast = "当前定稿视频不能删除，请先取消定稿。";
      render(workbench);
      return;
    }
    await deleteStoryboardVideo(
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
      await runAction(workbench, "婵繐绲藉﹢顏呯┍濠靛棛鎽犻柛鎺戞閺嗗懘骞撹箛姘墯...", async () => {
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
    workbench.ui.toast = `Updated storyboard ${selectedStoryboard.index} description.`;
    render(workbench);
    return;
  }

  if (action === "set-episode-media-mode") {
    workbench.ui.episodeMediaMode = target.dataset.mode ?? "image";
    render(workbench);
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
    workbench.ui.toast = "正在进入项目工作台...";
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
      workbench.ui.toast = `进入项目失败：${friendlyError(error)}`;
    }
    render(workbench);
    return;
  }

  if (action === "open-episode-workbench") {
    const episodeId = target.dataset.episodeId ?? "episode-primary";
    const storyboards = ensureEpisodeStoryboards(workbench, episodeId);
    workbench.ui.selectedEpisodeId = episodeId;
    workbench.ui.activeNavTab = "project";
    workbench.ui.projectPanelMode = "episode-workbench";
    workbench.ui.projectInteriorSection = "episodes";
    workbench.ui.projectInteriorStatusMenuOpen = false;
    workbench.ui.episodeCardMenuId = null;
    workbench.ui.selectedStoryboardId = storyboards[0]?.id ?? null;
    workbench.ui.toast = "Entered the episode workspace.";
    window.location.hash = "episode-workbench";
    render(workbench);
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
    workbench.ui.scriptSubmitLabel = "绾喛顓婚崚娑樼紦";
    workbench.ui.uploadNotice = "";
    render(workbench);
    return;
  }

  if (action === "close-single-episode-modal") {
    workbench.ui.isSingleEpisodeModalOpen = false;
    workbench.ui.singleEpisodeName = "";
    workbench.ui.singleEpisodeNotice = "";
    render(workbench);
    return;
  }

  if (action === "confirm-single-episode") {
    const nextName = workbench.ui.singleEpisodeName.trim();
    if (!nextName) {
      workbench.ui.singleEpisodeNotice = "Please enter an episode name.";
      render(workbench);
      return;
    }
    await runAction(workbench, "濮濓絽婀崚娑樼紦閸撗囨肠...", async () => {
      await workbench.api.createEpisode({
        projectId: workbench.ui.selectedProjectCardId,
        title: nextName,
      });
      if (workbench.ui.selectedProjectCardId) {
        applyProjectDetail(
          workbench,
          await workbench.api.getProjectDetail(workbench.ui.selectedProjectCardId),
        );
      }
      workbench.ui.isSingleEpisodeModalOpen = false;
      workbench.ui.singleEpisodeName = "";
      workbench.ui.singleEpisodeNotice = "";
      workbench.ui.episodeCardMenuId = null;
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
    await runAction(workbench, "濮濓絽婀柌宥呮嚒閸氬秴澧介梿?..", async () => {
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
    await runAction(workbench, "濮濓絽婀崚鐘绘珟閸撗囨肠...", async () => {
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
    await runAction(workbench, "濮濓絽婀柌宥呮嚒閸氬秷绁禍?..", async () => {
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
      workbench.ui.toast = `瀹告煡鍣搁崨钘夋倳娑?${normalizedName}`;
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
    await runAction(workbench, "濮濓絽婀崚鐘绘珟鐠у嫪楠?..", async () => {
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
    await runAction(workbench, "姝ｅ湪鍒犻櫎绱犳潗...", async () => {
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
      workbench.ui.toast = draft.name ? `已删除 ${draft.name}` : "已删除素材。";
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
          name: asset.name,
          storageObjectKey: asset.preview,
          mimeType: "image/svg+xml",
          width: 240,
          height: 240,
        })));
    } else {
      importRecords.push(...(workbench.ui.assetImportDrafts ?? [])
        .filter((draft) => selectedIds.has(draft.id))
        .map((draft) => ({
          name: draft.name?.trim() || "Untitled Asset",
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

    await runAction(workbench, "濮濓絽婀€电厧鍙嗙挧鍕獓...", async () => {
      for (const record of importRecords) {
        const imported = await workbench.api.importAsset({
          kind: importKind,
          ...record,
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
    workbench.ui.assetGeneratorStyleValue = "閺冪娀顥撻弽? 閺堫偂绗橀悳鍕";
    workbench.ui.assetGeneratorStyleCategory = "official";
    workbench.ui.assetGeneratorStyleOption = "none";
    workbench.ui.assetGeneratorMaterialCategory = "official";
    workbench.ui.assetGeneratorMaterialOption = "fantasy-doomsday";
    workbench.ui.assetGeneratorImageType = "main";
    workbench.ui.assetGeneratorModel = "閸楄櫕鈪?.0";
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
      await runAction(workbench, "濮濓絽婀穱婵嗙摠鐠у嫪楠?..", async () => {
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
    await runAction(workbench, "濮濓絽婀悽鐔稿灇鐠у嫪楠?..", async () => {
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
    await runAction(workbench, "濮濓絽婀弴瀛樻煀妞ゅ湱娲伴悩鑸碘偓?..", async () => {
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
    const projectId = target.dataset.projectId ?? null;
    workbench.root
      .querySelector(`input[data-action="upload-project-cover"][data-project-id="${projectId}"]`)
      ?.click();
    return;
  }

  if (action === "pick-asset-import-files") {
    target.querySelector(".asset-import-file-input")?.click();
    return;
  }

  if (action === "pick-local-video-upload") {
    const storyboardId = target.dataset.storyboardId ?? workbench.ui.selectedStoryboardId ?? "";
    workbench.root
      .querySelector(`.local-video-upload-input[data-storyboard-id="${storyboardId}"]`)
      ?.click();
    return;
  }

  if (action === "pick-local-storyboard-image") {
    const storyboardId = target.dataset.storyboardId ?? workbench.ui.selectedStoryboardId ?? "";
    workbench.root
      .querySelector(`.local-storyboard-image-input[data-storyboard-id="${storyboardId}"]`)
      ?.click();
    return;
  }

  if (action === "open-generation-upload") {
    const uploadTarget = target.dataset.uploadTarget ?? "";
    if (!uploadTarget) {
      return;
    }
    workbench.ui.isFirstFrameMenuOpen = false;
    workbench.ui.activeGenerationFrameMenu = null;
    workbench.root
      .querySelector(`.generation-upload-input[data-upload-target="${uploadTarget}"]`)
      ?.click();
    return;
  }

  if (action === "toggle-video-model-menu") {
    workbench.ui.isVideoModelMenuOpen = !workbench.ui.isVideoModelMenuOpen;
    workbench.ui.openGenerationSelectMenu = null;
    workbench.ui.isFirstFrameMenuOpen = false;
    workbench.ui.activeGenerationFrameMenu = null;
    render(workbench);
    return;
  }

  if (action === "select-video-model") {
    workbench.ui.selectedModelId = target.dataset.modelId ?? workbench.ui.selectedModelId;
    workbench.ui.isVideoModelMenuOpen = false;
    workbench.ui.toast = `Selected ${target.dataset.modelName ?? workbench.ui.selectedModelId}.`;
    render(workbench);
    return;
  }

  if (action === "toggle-generation-select-menu") {
    const field = target.dataset.field ?? "";
    workbench.ui.openGenerationSelectMenu =
      workbench.ui.openGenerationSelectMenu === field ? null : field;
    workbench.ui.isVideoModelMenuOpen = false;
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
        name: asset.name ?? "未命名资产",
        preview: asset.preview ?? asset.previewUrl ?? "",
        badge: asset.name ?? "已选素材",
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
      await runAction(workbench, "姝ｅ湪绉婚櫎鍙傝€冪礌鏉?..", async () => {
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
        summary: frameTarget === "firstFrame" ? "已关联当前分镜图" : "已从当前分镜图复制",
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
    await runAction(workbench, "婵繐绲藉﹢顏嗙磼閹存繄鏆伴柛鎺戞閺嗗懐妲愰悩铏稄...", async () => {
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
      workbench.ui.toast = "当前定稿视频不能删除，请先取消定稿。";
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
        "storyboard-video-subtitle-clean": "字幕擦除",
        "storyboard-video-upscale": "视频超分",
        "storyboard-video-frame": "抽帧",
        "storyboard-video-more": "更多",
        "storyboard-video-info": "详情",
      }[action] ?? "操作";
    workbench.ui.toast = `${actionLabel} 功能已预留，后续会接真实流程。`;
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
        "storyboard-image-to-video": "转视频",
        "storyboard-image-edit": "AI改图",
        "storyboard-image-multi-view": "多视图",
        "storyboard-image-crop": "裁切",
        "storyboard-image-info": "详情",
      }[action] ?? "操作";
    workbench.ui.toast = `${actionLabel} 功能已预留，后续会接真实流程。`;
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
    await runAction(workbench, "濮濓絽婀柌宥呮嚒閸氬秹銆嶉惄?..", async () => {
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
    await runAction(workbench, "濮濓絽婀崚鐘绘珟妞ゅ湱娲?..", async () => {
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
      await runAction(workbench, "婵繐绲藉﹢顏堝棘閺夋鏉婚柛鎺戞閺?..", async () => {
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
      isSkip ? "婵繐绲藉﹢顏嗘崉鐎圭姷绠栭柡宥佲偓鍐叉珯..." : "婵繐绲藉﹢顏嗘啺閸℃瑦纾伴柡宥佲偓鍐叉珯...",
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

  await runAction(workbench, statusForAction(action), async () => {
    if (action === "create-project") {
      const name = getInputValue(workbench.root, "#project-create-name-input", "").trim();
      if (!name) {
        workbench.ui.createProjectNotice = "请输入项目名称。";
        render(workbench);
        return;
      }

      const aspectRatio = getCheckedValue(workbench.root, "input[name=\"project-aspect-ratio\"]", "9:16");
      const projectType = getCheckedValue(workbench.root, "input[name=\"project-type\"]", "anime");
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

      const scriptInput = buildProjectSeedScript({ name, projectType });
      await workbench.api.createProject({
        name,
        scriptInput,
        aspectRatio,
        resolution: "1080p",
      });
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
      return;
    }

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
      const nextLabel = window.prompt("閺囧瓨鏌婄挧鍕獓閸氬秶袨", target.dataset.label ?? "");
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
    workbench.ui.imageGenerationResult = await workbench.api.generateImages(
      buildImageGenerationPayload(workbench),
    );
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
      workbench.ui.videoGenerationResult = await workbench.api.generateVideos(
        buildVideoGenerationPayload(workbench),
      );
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
      workbench.ui.exportPreviewResult = await workbench.api.previewExport();
    }
  });
}

async function runSmartGenerate(workbench) {
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
  }
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

async function runAction(workbench, message, action) {
  workbench.ui.busy = true;
  workbench.ui.toast = message;
  render(workbench);

  try {
    await action();
    await refresh(workbench);
    workbench.ui.toast = "Action completed.";
  } catch (error) {
    workbench.ui.toast = `閹垮秳缍旀径杈Е閿?{friendlyError(error)}`;
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
  workbench.ui.singleEpisodeNotice = "";
  workbench.ui.uploadNotice = "";
  render(workbench);
}

function openBatchEpisodeFlow(workbench) {
  workbench.ui.projectInteriorSection = "episodes";
  workbench.ui.isSingleEpisodeModalOpen = false;
  workbench.ui.isScriptModalOpen = true;
  workbench.ui.scriptTab = "script-upload";
  workbench.ui.scriptSubmitAction = "confirm-batch-episode";
  workbench.ui.scriptSubmitLabel = "确认批量分镜";
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

async function uploadLocalFile(workbench, file, category) {
  const result = await workbench.api.uploadFile(file, {
    category,
    projectId: workbench.state?.project?.id ?? workbench.ui.selectedProjectCardId ?? null,
  });
  if (!result?.upload) {
    throw new Error("upload_result_missing");
  }
  return result.upload;
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

  await runAction(workbench, "濮濓絽婀稉濠佺炊閸欏倽鈧啰绀岄弶?..", async () => {
    const createdReferences = [];
    const uploadedDrafts = [];
    for (const file of importableFiles) {
      const mediaKind = String(file.type || "").startsWith("video/") ? "video" : "image";
      const upload = await uploadLocalFile(workbench, file, "generation-references");
      const resolvedUrl = resolveApiUrl(upload.publicUrl);
      const imported = await workbench.api.importAsset({
        kind: mediaKind,
        name: normalizeAssetImportName(file.name),
        storageObjectKey: upload.storageObjectKey,
        sourceUrl: upload.publicUrl,
        mimeType: upload.mimeType,
        width: 1024,
        height: 1024,
      });
      uploadedDrafts.push({
        id: imported?.asset?.id ?? `reference-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        kind: mediaKind,
        url: resolvedUrl,
        assetId: imported?.asset?.id ?? null,
        assetVersionId: imported?.version?.id ?? null,
      });
      if (mediaKind === "image" && imported?.asset?.id && imported?.version?.id) {
        createdReferences.push({
          role: "reference_image",
          assetId: imported.asset.id,
          assetVersionId: imported.version.id,
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
      summary: "涓婁紶涓?..",
      url: state?.[stateKey]?.url ?? "",
    },
  }));
  render(workbench);

  try {
    const upload = await uploadLocalFile(workbench, file, category);
    updateStoryboardGenerationState(workbench, storyboardId, (state) => ({
      ...state,
      [stateKey]: {
        name: file.name,
        kind: String(file.type || "").startsWith("video/") ? "video" : "image",
        status: "ready",
        summary: stateKey === "editSourceVideo" ? "宸蹭笂浼犲緟缂栬緫瑙嗛" : "宸叉坊鍔犲埌褰撳墠妯″紡",
        url: resolveApiUrl(upload.publicUrl),
        storageObjectKey: upload.storageObjectKey,
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
      summary: "宸插叧鑱斿綋鍓嶅垎闀滃浘",
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

export function buildImageGenerationPayload(workbench) {
  const selectedStoryboard = getSelectedStoryboard(
    getActiveStoryboards(workbench),
    workbench.ui.selectedStoryboardId,
  );
  const generationState = selectedStoryboard?.generationState ?? createEmptyGenerationState();
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
      firstFrame: generationState.firstFrame ?? null,
      imageReference: generationState.imageReference ?? null,
      localReferenceRoles: generationState.localReferenceRoles ?? [],
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
    "episode-primary": primaryStoryboards,
  };

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
    workbench.ui.toast = "正在删除分镜...";
    render(workbench);
    try {
      await workbench.api.deleteShot({ shotId: storyboard.linkedShotId });
      applyLocalRemoval();
      removeDeletedShotFromState(workbench, storyboard.linkedShotId);
      persistWorkbenchState(workbench);
      workbench.ui.toast = "已删除分镜。";
    } catch (error) {
      workbench.ui.toast = `操作失败：${friendlyError(error)}`;
    } finally {
      workbench.ui.busy = false;
      render(workbench);
    }
    return;
  }

  applyLocalRemoval();
  persistWorkbenchState(workbench);
  workbench.ui.toast = "已删除分镜。";
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

function getDefaultEpisodeWorkbenchId(workbench) {
  return getDetailEpisodes(workbench.state)[0]?.id ?? "episode-primary";
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

async function handleAssetImportFiles(workbench, files) {
  const assetKind = workbench.ui.assetImportModal ?? workbench.ui.projectAssetTab ?? "character";
  const existingDrafts = workbench.ui.assetImportDrafts ?? [];
  const slotsLeft = Math.max(20 - existingDrafts.length, 0);
  const acceptedFiles = files.slice(0, slotsLeft);

  if (!acceptedFiles.length) {
    workbench.ui.toast = "You can import up to 20 local assets at a time.";
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
      ? `Imported ${acceptedFiles.length} assets; extra files were ignored.`
      : `Added ${acceptedFiles.length} pending asset imports.`;
  render(workbench);
}

async function handleLocalStoryboardVideoFiles(workbench, storyboardId, files) {
  const acceptedFiles = files.filter((file) => String(file.type || "").startsWith("video/"));
  if (!acceptedFiles.length) {
    workbench.ui.toast = "????????????";
    render(workbench);
    return;
  }

  for (const file of acceptedFiles) {
    await startStoryboardVideoUpload(workbench, storyboardId, file);
  }

  workbench.ui.toast = `??? ${acceptedFiles.length} ??????????`;
  render(workbench);
}

async function handleLocalStoryboardImageFile(workbench, storyboardId, file) {
  if (!String(file.type || "").startsWith("image/")) {
    workbench.ui.toast = "????????????";
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
  workbench.ui.toast = "Uploading storyboard image...";
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
    await runAction(workbench, "婵繐绲藉﹢顏呯▔婵犱胶鐐婇柛鎺戞閺嗗懘宕?..", async () => {
      const imported = await workbench.api.importShotMedia(storyboard.linkedShotId, {
        kind: "image",
        name: file.name,
        storageObjectKey: upload.storageObjectKey,
        sourceUrl: previewImageUrl,
        mimeType: upload.mimeType,
        width: 1024,
        height: 1024,
      });
      importedVersionId = imported?.version?.id ?? null;
      updateStoryboardById(workbench, activeStoryboardId, (currentStoryboard) => {
        const shouldAutoPin = !hadPinnedImage;
        const importedImage = createImageEntry(importedVersionId ?? `local-image-${Date.now()}`);
        const nextStoryboard = {
          ...currentStoryboard,
          imageStatus: "ready",
          uploadedImages: mergeStoryboardUploadedImages(currentStoryboard.uploadedImages ?? [], [importedImage]),
          previewImageUrl: shouldAutoPin ? previewImageUrl : currentStoryboard.previewImageUrl ?? null,
          uploadedImageName: shouldAutoPin ? file.name : currentStoryboard.uploadedImageName,
          currentImageAssetVersionId:
            shouldAutoPin ? importedImage.id : currentStoryboard.currentImageAssetVersionId ?? null,
        };
        return {
          ...nextStoryboard,
          previewUrl: shouldAutoPin ? previewImageUrl : resolveStoryboardCombinedPreviewUrl(nextStoryboard),
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
      workbench.ui.toast = `瑙嗛宸蹭繚鐣欏湪鏈湴锛屽悗绔悓姝ュけ璐ワ細${friendlyError(error)}`;
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
    upload = await uploadLocalFile(workbench, file, "storyboard-videos");
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
    await runAction(workbench, "婵繐绲藉﹢顏呯▔婵犱胶鐐婇柛鎺戞閺嗗懐鎲撮崱娑辨殽...", async () => {
      const imported = await workbench.api.importShotMedia(storyboard.linkedShotId, {
        kind: "video",
        name: file.name,
        storageObjectKey: upload.storageObjectKey,
        sourceUrl: resolvedUploadUrl,
        mimeType: upload.mimeType,
        width: 1024,
        height: 1024,
      });
      const importedVideo = {
        id: imported?.version?.id ?? videoId,
        fileName: file.name,
        src: resolvedUploadUrl,
        progress: 100,
        status: "ready",
        durationLabel: formatDurationLabelFromMs(imported?.version?.metadata?.durationMs),
        createdAt: Date.parse(imported?.version?.createdAt ?? "") || Date.now(),
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
    await runAction(workbench, "姝ｅ湪璁句负瀹氱瑙嗛...", async () => {
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
    await runAction(workbench, "姝ｅ湪鍙栨秷瀹氱瑙嗛...", async () => {
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
    character: "闁惧爼娼版鎴濓紜",
    scene: "閻滈鍞柈钘夌",
    prop: "妤犳垵锛嬮梹鍨ⅳ",
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
    storageObjectKey: upload.storageObjectKey,
    sourceUrl: upload.publicUrl,
    mimeType: upload.mimeType,
  };
}

function normalizeAssetImportName(fileName) {
  const rawName = String(fileName ?? "").replace(/\.[^.]+$/, "").trim();
  return rawName || "Untitled Asset";
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
      ? `已返回 ${label} 资产库，并定位到刚导入的 ${count} 项。`
      : `已返回 ${label} 资产库，请查看最新导入结果。`;
  workbench.ui.assetLibraryPendingFocusAssetIds = normalizedIds;
  workbench.ui.toast =
    count > 0
      ? `${label}已导入 ${count} 项，并已定位到资源库。`
      : `已返回 ${label} 资产库。`;
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
    return mediaType === "video" ? "瑙嗛涓讳綋" : "鍥剧墖涓讳綋";
  }
  return (
    {
      character: "瑙掕壊",
      scene: "鍦烘櫙",
      prop: "閬撳叿",
    }[assetKind] ?? "璧勪骇"
  );
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
  workbench.ui.toast = "已删除当前分镜图片。";
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
  workbench.ui.toast = `已删除 ${video.fileName || "分镜视频"}。`;
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
    name: draft.name?.trim() || "Untitled Asset",
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
      { id: "official-character-1", name: "主角", preview: buildColorAssetPreview("#f2f3f8", "#11161f") },
      { id: "official-character-2", name: "配角", preview: buildColorAssetPreview("#efe5d8", "#26262e") },
      { id: "official-character-3", name: "反派", preview: buildColorAssetPreview("#dde5f2", "#49526a") },
      { id: "official-character-4", name: "群演", preview: buildColorAssetPreview("#f3f2f7", "#6a617f") },
    ],
    scene: [
      { id: "official-scene-1", name: "閻滈鍞柈钘夌", preview: buildScenePreview("#263141", "#5a6d93") },
      { id: "official-scene-2", name: "Office District", preview: buildScenePreview("#2c3038", "#858ca0") },
      { id: "official-scene-3", name: "Reception Room", preview: buildScenePreview("#2f2a28", "#8f7358") },
      { id: "official-scene-4", name: "婢垛晛褰存径婊勬珯", preview: buildScenePreview("#161c30", "#4b76bf") },
    ],
    prop: [
      { id: "official-prop-1", name: "手机", preview: buildPropPreview("#f0f1f4", "#1a1d24") },
      { id: "official-prop-2", name: "电脑", preview: buildPropPreview("#eff1f6", "#6a7480") },
      { id: "official-prop-3", name: "霓虹招牌", preview: buildPropPreview("#1d2431", "#68bbff") },
      { id: "official-prop-4", name: "能量装置", preview: buildPropPreview("#17191f", "#8e5bff") },
    ],
    other: [
      { id: `official-other-${category}-1`, name: "Seedance 2.0 视频", preview: buildVideoPreview("#242635", "#ffffff") },
      { id: `official-other-${category}-2`, name: "分镜视频参考", preview: buildVideoPreview("#202433", "#d8dff5") },
      { id: `official-other-${category}-3`, name: "Reference Image", preview: buildColorAssetPreview("#f6f6f9", "#35384a") },
      { id: `official-other-${category}-4`, name: "环境参考", preview: buildScenePreview("#27303f", "#64758d") },
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
    status: "Draft",
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
  return nextIndex === 1 ? "閸撗傜" : `閸撗囨肠 ${nextIndex}`;
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
      "create-project": "濮濓絽婀崚娑樼紦妞ゅ湱娲?..",
      "parse-script": "濮濓絽婀幏鍡毿掗崜褎婀?..",
      "confirm-all-assets": "濮濓絽婀涵顔款吇閸忋劑鍎寸挧鍕獓...",
      "confirm-asset": "濮濓絽婀涵顔款吇鐠у嫪楠?..",
      "edit-asset": "濮濓絽婀弴瀛樻煀鐠у嫪楠囬崥宥囆?..",
      "run-calibration": "濮濓絽婀弽鈥冲櫙閸掑棝鏆?..",
      "generate-images": "濮濓絽婀悽鐔稿灇閸ュ墽澧?..",
      "generate-videos": "濮濓絽婀悽鐔稿灇鐟欏棝顣?..",
      "smart-generate": "濮濓絽婀幍褑顢戦悽鐔稿灇闁炬崘鐭?..",
      "preview-export": "濮濓絽婀悽鐔稿灇鐎电厧鍤０鍕潔...",
    }[action] ?? "濮濓絽婀径鍕倞..."
  );
}

function friendlyError(error) {
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
    }[message] ?? message
  );
}

function getInputValue(root, selector, fallback) {
  const value = root.querySelector(selector)?.value?.trim();
  return value || fallback;
}

function getCheckedValue(root, selector, fallback) {
  return root.querySelector(`${selector}:checked`)?.value ?? fallback;
}

function deriveInitialNavTab(hash) {
  const token = String(hash || "").replace(/^#/, "");
  if (!token) {
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
  if (token === "team") {
    return "team";
  }
  return "project";
}

function deriveInitialProjectPanelMode(hash) {
  const token = String(hash || "").replace(/^#/, "");
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
      home: "Home",
      script: "Script",
      project: "Project",
      library: "Library",
      tools: "Tools",
      team: "Team",
    }[tab] ?? "Workspace"
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
  if (!detail?.project) {
    return;
  }
  workbench.state = {
    ...(workbench.state ?? {}),
    project: detail.project,
    script: detail.script ?? null,
    shots: detail.shots ?? [],
    projectDetail: detail,
  };
  workbench.ui.projectDetail = detail;
  workbench.ui.exportHistory = detail.exportHistory ?? workbench.ui.exportHistory ?? [];
  workbench.ui.importedAssets = mapProjectDetailAssets(detail.assetsByType);
  workbench.ui.customEpisodes = getDetailEpisodes(workbench.state);
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
    name: asset.label ?? asset.assetKey ?? "Untitled Asset",
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
    name: asset.label ?? asset.assetKey ?? "Untitled Asset",
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
    status: episode.status === "ready" ? "Ready" : "Draft",
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
      title: "鍓т竴",
      status: "Draft",
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

async function syncProjectLibraryFromApi(workbench) {
  const payload = await workbench.api.getProjects();
  const projects = Array.isArray(payload.projects)
    ? payload.projects.map((project) => mapProjectRecordToCard(project))
    : [];
  workbench.ui.projectLibrary = projects;
  syncSelectedProjectCard(workbench, projects);
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
    name: project.name ?? "Untitled Project",
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
    return "Delivered";
  }
  if (phase === "shot_generation" || phase === "asset_review") {
    return "In Progress";
  }
  return "Draft";
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
  const image = findStoryboardImage(storyboard, imageId);
  if (!image?.src || !image?.id) {
    return false;
  }
  updateStoryboardGenerationState(workbench, storyboardId, (state) => ({
    ...state,
    imageReference: {
      name: storyboard.uploadedImageName || "storyboard-image",
      kind: "image",
      status: "ready",
      summary: "宸插叧鑱斿綋鍓嶅垎闀滃浘",
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
      summary: "已载入当前分镜视频",
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
    workbench.ui.toast = "当前分镜还没有可操作的图片。";
    return;
  }

  if (action === "storyboard-image-to-video") {
    workbench.ui.episodeMediaMode = "video";
    workbench.ui.videoGenerationMode = "first-frame";
    workbench.ui.selectedModelId = "vidu-q3-pro";
    syncGenerationStateFromStoryboardImage(workbench, storyboardId);
    workbench.ui.prompt = workbench.ui.prompt || buildSuggestedPrompt(storyboard, { episodeMediaMode: "video" });
    workbench.ui.toast = "已切换到首帧生成视频，并载入当前分镜图。";
    return;
  }

  if (action === "storyboard-image-edit") {
    workbench.ui.episodeMediaMode = "image";
    workbench.ui.imageGenerationMode = "single-image";
    workbench.ui.selectedModelId = "jimeng-4-5";
    setImageReferenceFromStoryboard(workbench, storyboardId);
    workbench.ui.prompt = workbench.ui.prompt || buildSuggestedPrompt(storyboard, { episodeMediaMode: "image" });
    workbench.ui.toast = "已切换到单图模式，并载入当前图片作为参考图。";
    return;
  }

  if (action === "storyboard-image-multi-view") {
    workbench.ui.episodeMediaMode = "image";
    workbench.ui.imageGenerationMode = "multi-image";
    workbench.ui.selectedModelId = "tnb-pro";
    workbench.ui.imageCount = clampCount(workbench.ui.imageCount ?? 4, 1, 4);
    syncGenerationStateFromStoryboardImage(workbench, storyboardId);
    workbench.ui.toast = "已切换到多视图模式，并载入当前分镜图。";
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
    workbench.ui.toast = "已切换当前参考图裁切模式。";
    return;
  }

  openAssetInspector(workbench, {
    type: "image",
    storyboardId,
    title: storyboard.title || "鍒嗛暅鍥剧墖",
    name: storyboard.uploadedImageName || "鍒嗛暅鍥剧墖",
    url: storyboard.previewImageUrl,
    status: storyboard.imageStatus || "ready",
  });
}

function applyStoryboardVideoToolAction(workbench, action, storyboardId, videoId) {
  const storyboard = getActiveStoryboards(workbench).find((item) => item.id === storyboardId);
  const video = setEditSourceVideoFromStoryboard(workbench, storyboardId, videoId);
  if (!video?.src) {
    workbench.ui.toast = "当前分镜还没有可操作的视频。";
    return;
  }

  if (action === "storyboard-video-more" || action === "storyboard-video-info") {
    openAssetInspector(workbench, {
      type: "video",
      storyboardId,
      videoId: video.id,
      title: storyboard?.title || "鍒嗛暅瑙嗛",
      name: video.fileName || "鍒嗛暅瑙嗛",
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
    workbench.ui.toast = "已切换到 AI 改视频，并载入当前视频用于超分处理。";
    return;
  }
  if (action === "storyboard-video-subtitle-clean") {
    workbench.ui.prompt = `${workbench.ui.prompt || ""} remove subtitles, keep framing and motion stable`.trim();
    workbench.ui.toast = "已切换到 AI 改视频，并载入当前视频用于字幕擦除。";
    return;
  }
  syncGenerationStateFromStoryboardImage(workbench, storyboardId);
  workbench.ui.toast = "已载入当前视频到编辑模式，可继续在右侧完成抽帧相关生成。";
}

async function deleteStoryboardImage(workbench, storyboardId, imageId = "") {
  const storyboard = getActiveStoryboards(workbench).find((item) => item.id === storyboardId);
  const image = findStoryboardImage(storyboard, imageId);
  if (!image?.src || !image?.id) {
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
    workbench.ui.toast = "姝ｅ湪瑙ｇ粦鍒嗛暅鍥剧墖...";
    render(workbench);
    try {
      const result = await workbench.api.deleteShotMedia(storyboard.linkedShotId, {
        kind: "image",
        assetVersionId: resolvedAssetVersionId,
      });
      applyLocalRemoval();
      if (result?.missing) {
        persistWorkbenchState(workbench);
        workbench.ui.toast = "图片已从当前视图移除，后端媒体记录未找到。";
        return;
      }
      await refresh(workbench);
      workbench.ui.toast = "Action completed.";
    } catch (error) {
      workbench.ui.toast = `鎿嶄綔澶辫触锛?{friendlyError(error)}`;
    } finally {
      workbench.ui.busy = false;
      render(workbench);
    }
    return;
  }

  applyLocalRemoval();
  persistWorkbenchState(workbench);
  workbench.ui.toast = "已移除当前分镜图片。";
  render(workbench);
}

async function deleteStoryboardVideo(workbench, storyboardId, videoId) {
  if (!storyboardId || !videoId) {
    return;
  }

  const storyboard = getActiveStoryboards(workbench).find((item) => item.id === storyboardId);
  if (isStoryboardVideoProtected(storyboard, videoId)) {
    workbench.ui.toast = "当前定稿视频不能删除，请先取消定稿。";
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
    await runAction(workbench, "姝ｅ湪瑙ｇ粦鍒嗛暅瑙嗛...", async () => {
      try {
        await workbench.api.deleteShotMedia(storyboard.linkedShotId, {
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

