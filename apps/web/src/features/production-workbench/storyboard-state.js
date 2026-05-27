import { resolveApiUrl } from "../../shared/creator-api.js";

function formatDurationLabelFromMs(value) {
  const seconds = Math.max(0, Math.round(Number(value ?? 10_000) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function resolveVideoVersionSource(version) {
  if (!version || typeof version !== "object") {
    return "";
  }

  const candidates = [
    version.previewUrl,
    version.sourceUrl,
    version.metadata?.previewUrl,
    version.metadata?.sourceUrl,
    version.storageObjectKey,
  ];

  const resolved = candidates.find((candidate) => typeof candidate === "string" && candidate.trim()) ?? "";
  return resolved ? resolveApiUrl(resolved) : "";
}

function resolveImageVersionSource(version) {
  if (!version || typeof version !== "object") {
    return "";
  }

  const candidates = [
    version.previewUrl,
    version.sourceUrl,
    version.metadata?.previewUrl,
    version.metadata?.sourceUrl,
    version.storageObjectKey,
  ];

  const resolved = candidates.find((candidate) => typeof candidate === "string" && candidate.trim()) ?? "";
  return resolved ? resolveApiUrl(resolved) : "";
}

export const projectDetailFixture = {
  project: {
    id: "try",
    name: "try",
    phase: "not_started",
    statusLabel: "未开始",
    type: "2D/3D 动漫",
    aspectRatio: "9:16",
    resolution: "1080p",
  },
  assets: { characters: 0, scenes: 0, props: 0, others: 0 },
  episodes: [
    {
      id: "episode-1",
      title: "剧一",
      status: "未定稿",
      storyboardCount: 0,
    },
  ],
};

export function addStoryboard(storyboards) {
  const normalizedStoryboards = normalizeStoryboardIndices(storyboards);
  const nextIndex = normalizedStoryboards.length + 1;
  return normalizeStoryboardIndices([
    ...normalizedStoryboards,
    {
      id: `storyboard-${nextIndex}`,
      index: nextIndex,
      title: `${nextIndex}`,
      status: "未定稿",
      imageStatus: "empty",
      videoStatus: "empty",
      linkedShotId: null,
      description: "请填写分镜描述，记录分镜对应的画面内容。",
      uploadedImageName: "",
      uploadedImages: [],
      uploadedVideos: [],
      selectedUploadedVideoId: null,
      previewThumbnailUrl: null,
      references: [],
      generationState: createEmptyGenerationState(),
    },
  ]);
}

export function sortStoryboardsByIndex(storyboards = []) {
  return [...storyboards].sort((left, right) => {
    const leftIndex = resolveStoryboardOrder(left);
    const rightIndex = resolveStoryboardOrder(right);
    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    const leftLinkedId = String(left?.linkedShotId ?? left?.id ?? "");
    const rightLinkedId = String(right?.linkedShotId ?? right?.id ?? "");
    return leftLinkedId.localeCompare(rightLinkedId, "zh-CN-u-kn-true");
  });
}

export function normalizeStoryboardIndices(storyboards = []) {
  const usedIds = new Set();
  return sortStoryboardsByIndex(storyboards).map((storyboard, index) => {
    const nextId = createUniqueStoryboardId(storyboard, index, usedIds);
    return {
      ...storyboard,
      id: nextId,
      index: index + 1,
      title: isNumericStoryboardTitle(storyboard?.title) ? `${index + 1}` : (storyboard?.title ?? `${index + 1}`),
    };
  });
}

export function createStoryboardList(state) {
  const shots = [...(state?.projectDetail?.shots ?? state?.shots ?? [])].sort((left, right) => {
    const leftOrder = resolveShotOrder(left);
    const rightOrder = resolveShotOrder(right);
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return String(left?.id ?? "").localeCompare(String(right?.id ?? ""), "zh-CN-u-kn-true");
  });
  if (shots.length === 0) {
    return [];
  }

  return shots.map((shot, index) => ({
    id: shot.id ? `storyboard-${shot.id}` : createLocalStoryboardId(),
    index: index + 1,
    title: `${index + 1}`,
    status:
      shot.currentVideoAssetVersionId || shot.currentImageAssetVersionId ? "已生成" : "未定稿",
    imageStatus: shot.currentImageAssetVersionId ? "ready" : "empty",
    videoStatus: shot.currentVideoAssetVersionId ? "ready" : "empty",
    linkedShotId: shot.id,
    episodeId: shot.episodeId ?? null,
    description: shot.description || shot.title,
    previewImageUrl: shot.previewImageUrl ? resolveApiUrl(shot.previewImageUrl) : null,
    previewVideo: shot.previewVideoUrl ? resolveApiUrl(shot.previewVideoUrl) : null,
    previewUrl: shot.previewVideoUrl
      ? resolveApiUrl(shot.previewVideoUrl)
      : shot.previewImageUrl
        ? resolveApiUrl(shot.previewImageUrl)
        : null,
    previewThumbnailUrl: null,
    uploadedImageName:
      shot.imageVersions?.find((version) => version.id === shot.currentImageAssetVersionId)?.metadata?.label ??
      shot.imageVersions?.[0]?.metadata?.label ??
      "",
    uploadedImages: (shot.imageVersions ?? []).map((version) => ({
      id: version.id,
      deleteAssetId: version.id,
      fileName: version.metadata?.label ?? "image",
      src: resolveImageVersionSource(version),
      status: "ready",
      createdAt: Date.parse(version.createdAt ?? "") || Date.now(),
    })),
    uploadedVideos: (shot.videoVersions ?? []).map((version) => ({
      id: version.id,
      fileName: version.metadata?.label ?? "video",
      src: resolveVideoVersionSource(version),
      durationLabel: formatDurationLabelFromMs(version.metadata?.durationMs),
      status: "ready",
      createdAt: Date.parse(version.createdAt ?? "") || Date.now(),
    })),
    currentImageAssetVersionId: shot.currentImageAssetVersionId ?? null,
    selectedUploadedVideoId: shot.currentVideoAssetVersionId ?? null,
    references: shot.references ?? [],
    generationState: createEmptyGenerationState(),
  }));
}

export function createEmptyGenerationState() {
  return {
    firstFrame: null,
    lastFrame: null,
    imageReference: null,
    editSourceVideo: null,
    referenceUploads: [],
    localReferenceRoles: [],
    referenceSelections: [],
  };
}

export function getSelectedStoryboard(storyboards, selectedStoryboardId) {
  const orderedStoryboards = normalizeStoryboardIndices(storyboards);
  return (
    orderedStoryboards.find((storyboard) => storyboard.id === selectedStoryboardId) ??
    orderedStoryboards[0] ??
    null
  );
}

function createLocalStoryboardId() {
  return `storyboard-local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createUniqueStoryboardId(storyboard, index, usedIds) {
  const rawId = String(storyboard?.id ?? "").trim();
  const linkedId = String(storyboard?.linkedShotId ?? "").trim();
  const baseId =
    rawId ||
    (linkedId
      ? `storyboard-${linkedId}`
      : `storyboard-local-${index + 1}`);
  let candidate = baseId;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

function resolveShotOrder(shot) {
  const candidates = [shot?.sortOrder, shot?.sequence, shot?.index];
  const resolved = candidates.find((value) => Number.isFinite(Number(value)) && Number(value) >= 0);
  return resolved == null ? Number.MAX_SAFE_INTEGER : Number(resolved);
}

function resolveStoryboardOrder(storyboard) {
  const candidates = [storyboard?.sortOrder, storyboard?.sequence, storyboard?.index];
  const resolved = candidates.find((value) => Number.isFinite(Number(value)) && Number(value) >= 0);
  return resolved == null ? Number.MAX_SAFE_INTEGER : Number(resolved);
}

function isNumericStoryboardTitle(value) {
  return /^\d+$/.test(String(value ?? "").trim());
}

export function getProjectDetailState(state) {
  const detail = state?.projectDetail;
  const sourceProject = detail?.project ?? state?.project;
  const project = sourceProject
    ? {
        id: sourceProject.id,
        name: sourceProject.name,
        phase: sourceProject.phase,
        statusLabel: phaseToStatusLabel(sourceProject.phase),
        type: "2D/3D 动漫",
        aspectRatio: sourceProject.aspectRatio ?? "9:16",
        resolution: sourceProject.resolution ?? "1080p",
        createdAt: sourceProject.createdAt ?? "2026/05/22",
      }
    : projectDetailFixture.project;

  const assetCandidates = state?.assetCandidates;
  const assets = detail?.assetSummary
    ? {
        characters: detail.assetSummary.character?.count ?? 0,
        scenes: detail.assetSummary.scene?.count ?? 0,
        props: detail.assetSummary.prop?.count ?? 0,
        others: detail.assetSummary.other?.count ?? 0,
        previews: {
          character: detail.assetSummary.character?.previews ?? [],
          scene: detail.assetSummary.scene?.previews ?? [],
          prop: detail.assetSummary.prop?.previews ?? [],
          other: detail.assetSummary.other?.previews ?? [],
        },
      }
    : assetCandidates
      ? {
          characters: assetCandidates.characters.length,
          scenes: assetCandidates.scenes.length,
          props: assetCandidates.props.length,
          others: assetCandidates.props.filter((candidate) => !candidate.required).length,
        }
      : projectDetailFixture.assets;

  const storyboardCount = (detail?.shots ?? state?.shots ?? []).length;
  const episodes =
    Array.isArray(detail?.episodes) && detail.episodes.length
      ? detail.episodes.map((episode) => ({
          id: episode.id,
          title: episode.title,
          status: episode.status === "ready" ? "已定稿" : "未定稿",
          createdAt: episode.createdAt ?? project.createdAt ?? "2026/05/22",
          storyboardCount: episode.storyboardCount ?? 0,
          previewUrl: episode.previewUrl ?? null,
        }))
      : [
          {
            id: "episode-primary",
            title: projectDetailFixture.episodes[0].title,
            status: storyboardCount > 0 ? "未定稿" : projectDetailFixture.episodes[0].status,
            createdAt: project.createdAt ?? "2026/05/22",
            storyboardCount,
          },
        ];

  return { project, assets, episodes };
}

function phaseToStatusLabel(phase) {
  if (phase === "asset_review") {
    return "资产准备";
  }
  if (phase === "shot_generation") {
    return "分镜生成";
  }
  if (phase === "export") {
    return "待导出";
  }
  return "未开始";
}
