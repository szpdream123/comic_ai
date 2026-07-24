const VIDEO_EXTENSIONS = [".mp4", ".webm", ".ogg", ".ogv", ".mov"];
import { storageObjectContentUrl } from "../loomic-core/canvas-file-persistence.js";

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".svg"];
const AUDIO_EXTENSIONS = [".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".oga", ".opus"];
const MIME_EXTENSIONS = new Map([
  ["image/png", ".png"], ["image/jpeg", ".jpg"], ["image/webp", ".webp"],
  ["image/gif", ".gif"], ["image/avif", ".avif"], ["image/svg+xml", ".svg"],
  ["video/mp4", ".mp4"], ["video/webm", ".webm"], ["video/quicktime", ".mov"],
  ["video/ogg", ".ogv"], ["audio/mpeg", ".mp3"], ["audio/mp3", ".mp3"],
  ["audio/wav", ".wav"], ["audio/x-wav", ".wav"], ["audio/mp4", ".m4a"],
  ["audio/x-m4a", ".m4a"], ["audio/aac", ".aac"], ["audio/flac", ".flac"],
  ["audio/ogg", ".ogg"], ["audio/opus", ".opus"],
]);
const CANVAS_FILES_DIALOG_VIEWS = new Set(["assets", "library-character", "library-style", "history"]);

export function nextCanvasFilesDialogRequest(current, view) {
  const normalizedView = String(view ?? "").trim();
  if (!CANVAS_FILES_DIALOG_VIEWS.has(normalizedView)) return current ?? null;
  return {
    view: normalizedView,
    requestId: (Number(current?.requestId) || 0) + 1,
  };
}

function firstText(...values) {
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) return normalized;
  }
  return "";
}

export function resolveCanvasAssetContentUrl(entry = {}) {
  const storageObjectId = firstText(
    entry.storageObjectId,
    entry.storage_object_id,
    entry.resultStorageObjectId,
    entry.result_storage_object_id,
    entry.metadata?.storageObjectId,
    entry.metadata?.storage_object_id,
  );
  const stableUrl = storageObjectContentUrl(storageObjectId);
  if (stableUrl) return stableUrl;
  const sourceUrl = firstText(
    entry.downloadUrl,
    entry.storageUrl,
    entry.mediaUrl,
    entry.url,
    entry.sourceUrl,
  );
  if (sourceUrl) return sourceUrl;
  const previewUrl = firstText(entry.previewUrl, entry.thumbnailUrl);
  const kind = firstText(entry.type, entry.category, entry.mediaKind).toLowerCase();
  if (kind === "video") return hasVideoExtension(previewUrl) ? previewUrl : "";
  if (kind === "audio") return hasAudioExtension(previewUrl) ? previewUrl : "";
  return previewUrl;
}

function extensionFromUrl(url, extensions) {
  if (!url) return "";
  try {
    const pathname = new URL(url, "https://placeholder.invalid").pathname.toLowerCase();
    return extensions.find((extension) => pathname.endsWith(extension)) ?? "";
  } catch {
    const normalized = String(url).toLowerCase();
    return extensions.find((extension) => normalized.includes(extension)) ?? "";
  }
}

export function resolveCanvasAssetDownload(entry = {}) {
  const url = resolveCanvasAssetContentUrl(entry);
  if (!url) return null;
  const mimeType = firstText(entry.mimeType, entry.contentType).split(";", 1)[0].trim().toLowerCase();
  const kind = firstText(entry.type, entry.category, entry.mediaKind, mimeType.split("/", 1)[0]).toLowerCase();
  const extensions = kind === "video" ? VIDEO_EXTENSIONS : kind === "audio" ? AUDIO_EXTENSIONS : IMAGE_EXTENSIONS;
  const title = firstText(entry.title, entry.name, "素材");
  if (extensions.some((extension) => title.toLowerCase().endsWith(extension))) return { url, fileName: title };
  const extension = MIME_EXTENSIONS.get(mimeType)
    || extensionFromUrl(url, extensions)
    || (kind === "video" ? ".mp4" : kind === "audio" ? ".mp3" : ".png");
  return { url, fileName: `${title}${extension}` };
}

function hasVideoExtension(url) {
  if (!url) return false;
  try {
    const pathname = new URL(url, "https://placeholder.invalid").pathname.toLowerCase();
    return VIDEO_EXTENSIONS.some((extension) => pathname.endsWith(extension));
  } catch {
    return VIDEO_EXTENSIONS.some((extension) => String(url).toLowerCase().includes(extension));
  }
}

function hasImageExtension(url) {
  if (!url) return false;
  try {
    const pathname = new URL(url, "https://placeholder.invalid").pathname.toLowerCase();
    return IMAGE_EXTENSIONS.some((extension) => pathname.endsWith(extension));
  } catch {
    return IMAGE_EXTENSIONS.some((extension) => String(url).toLowerCase().includes(extension));
  }
}

function hasAudioExtension(url) {
  if (!url) return false;
  try {
    const pathname = new URL(url, "https://placeholder.invalid").pathname.toLowerCase();
    return AUDIO_EXTENSIONS.some((extension) => pathname.endsWith(extension));
  } catch {
    return AUDIO_EXTENSIONS.some((extension) => String(url).toLowerCase().includes(extension));
  }
}

export function getCanvasFileType(element) {
  if (element?.customData?.type === "image-generator") return "image-generator";
  if (element?.customData?.type === "video-generator") return "video-generator";
  if (element?.customData?.type === "audio-node") return ["upload", "generated"].includes(element.customData?.sourceKind) ? "audio" : "audio-generator";
  if (element?.type === "image") return "image";
  if (element?.type === "embeddable" && (element.customData?.isVideo || hasVideoExtension(element.link))) return "video";
  return null;
}

function titleFor(element, type, index) {
  if (element.customData?.canvasFileName) return element.customData.canvasFileName;
  if (type === "image-generator") return element.customData?.prompt || element.customData?.title || `图片生成 ${index}`;
  if (type === "video-generator") return element.customData?.prompt || element.customData?.title || `视频生成 ${index}`;
  if (type === "audio-generator") return element.customData?.prompt || element.customData?.title || `音频生成 ${index}`;
  if (type === "image") return element.customData?.title || element.customData?.label || `图片 ${index}`;
  if (type === "audio") return element.customData?.fileName || element.customData?.title || `音频 ${index}`;
  return element.customData?.title || element.customData?.prompt || `视频 ${index}`;
}

function categoryFor(type) {
  if (["image-generator", "video-generator", "audio-generator"].includes(type)) return "generator";
  return type;
}

function labelFor(type) {
  return {
    image: "图片",
    video: "视频",
    audio: "音频",
    "image-generator": "图片生成",
    "video-generator": "视频生成",
    "audio-generator": "音频生成",
  }[type];
}

function normalizeCloudMediaType(asset) {
  const mimeType = firstText(
    asset?.mimeType,
    asset?.contentType,
    asset?.latestVersion?.mimeType,
    asset?.latestVersion?.metadata?.mimeType,
  ).toLowerCase();
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  const kind = firstText(
    asset?.mediaKind,
    asset?.mediaType,
    asset?.assetType,
    asset?.resourceType,
    asset?.category,
    asset?.kind,
    asset?.type,
  ).toLowerCase();
  if (["video", "videos", "motion"].includes(kind)) return "video";
  if (["image", "images", "picture", "photo", "role", "character", "character_sheet", "scene", "scene_reference", "prop", "prop_reference", "object", "style"].includes(kind)) return "image";
  if (["audio", "voice", "music"].includes(kind)) return "audio";
  const candidateUrl = firstText(
    asset?.downloadUrl,
    asset?.storageUrl,
    asset?.sourceUrl,
    asset?.fileUrl,
    asset?.mediaUrl,
    asset?.videoUrl,
    asset?.imageUrl,
    asset?.audioUrl,
    asset?.url,
    asset?.latestVersion?.metadata?.sourceUrl,
    asset?.latestVersion?.previewUrl,
    asset?.previewUrl,
  );
  if (hasVideoExtension(candidateUrl)) return "video";
  if (hasImageExtension(candidateUrl)) return "image";
  if (hasAudioExtension(candidateUrl)) return "audio";
  return null;
}

export function normalizeCanvasAssetCategory(asset = {}, mediaType = "") {
  const resolvedMediaType = firstText(mediaType).toLowerCase() || normalizeCloudMediaType(asset);
  const value = firstText(
    asset.assetCategory,
    asset.resourceCategory,
    asset.category,
    asset.assetType,
    asset.kind,
    asset.resourceType,
    asset.type,
    asset.latestVersion?.metadata?.category,
    asset.latestVersion?.metadata?.assetType,
  ).toLowerCase().replace(/[\s-]+/g, "_");
  if (["character", "role", "person", "character_sheet", "人物", "角色"].includes(value)) return "character";
  if (["scene", "background", "environment", "scene_reference", "场景"].includes(value)) return "scene";
  if (["prop", "object", "prop_reference", "道具", "物品"].includes(value)) return "prop";
  if (["style", "prompt_style", "image_style", "风格"].includes(value)) return "style";
  if (resolvedMediaType === "audio" && ["sound_effect", "sound_fx", "sfx", "effect", "effects", "音效"].includes(value)) return "audio";
  return "other";
}

function rowsFromCloudPayload(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["data", "items", "assets", "results", "records"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function normalizeCloudAsset(asset, source, index) {
  if (!asset || typeof asset !== "object") return null;
  const type = normalizeCloudMediaType(asset);
  if (!type) return null;
  const mimeType = firstText(
    asset.mimeType,
    asset.contentType,
    asset.latestVersion?.mimeType,
    asset.latestVersion?.metadata?.mimeType,
    type === "video" ? "video/mp4" : type === "audio" ? "audio/mpeg" : "image/png",
  );
  const previewUrl = firstText(
    asset.thumbnailUrl,
    asset.previewUrl,
    asset.preview,
    asset.fixedImageUrl,
    asset.latestVersion?.metadata?.previewUrl,
    asset.latestVersion?.metadata?.fixedImageUrl,
    asset.latestVersion?.previewUrl,
  );
  let storageUrl = firstText(
    asset.downloadUrl,
    asset.storageUrl,
    asset.sourceUrl,
    asset.fileUrl,
    asset.mediaUrl,
    type === "video" ? asset.videoUrl : type === "audio" ? asset.audioUrl : asset.imageUrl,
    asset.url,
    asset.latestVersion?.metadata?.sourceUrl,
    asset.latestVersion?.storageUrl,
    asset.latestVersion?.url,
  );
  if (!storageUrl && type === "image") storageUrl = previewUrl;
  if (!storageUrl && type === "video" && hasVideoExtension(previewUrl)) {
    storageUrl = previewUrl;
  }
  if (!storageUrl && type === "audio" && hasAudioExtension(previewUrl)) {
    storageUrl = previewUrl;
  }
  const sourceId = firstText(asset.id, asset.assetId, asset.mediaId, asset.storageObjectId, `${index + 1}`);
  const storageObjectId = firstText(
    asset.storageObjectId,
    asset.storage_object_id,
    asset.fixedImageStorageObjectId,
    asset.fixed_image_storage_object_id,
    asset.latestVersion?.storageObjectId,
    asset.latestVersion?.storage_object_id,
    asset.latestVersion?.metadata?.storageObjectId,
    asset.latestVersion?.metadata?.storage_object_id,
    source === "personal-library" ? asset.id : undefined,
  );
  const contentUrl = storageObjectContentUrl(storageObjectId);
  if (!storageUrl && !contentUrl) return null;
  const stableStorageUrl = contentUrl || storageUrl;
  const sourceLabel = {
    "personal-library": "个人素材",
    "official-library": "官方素材",
    "team-library": "团队素材",
  }[source] ?? "云端素材";
  return {
    id: `cloud:${source}:${sourceId}`,
    sourceId,
    source,
    sourceLabel,
    sourceAction: firstText(asset.sourceAction, asset.latestVersion?.metadata?.source, asset.source),
    type,
    category: type,
    assetCategory: normalizeCanvasAssetCategory(asset, type),
    kindLabel: labelFor(type),
    title: firstText(asset.fileName, asset.name, asset.title, asset.label, asset.assetKey, `${sourceLabel} ${index + 1}`),
    mediaUrl: contentUrl || (type === "audio" ? stableStorageUrl : previewUrl || stableStorageUrl),
    previewUrl: previewUrl || stableStorageUrl,
    thumbnailUrl: previewUrl && !hasVideoExtension(previewUrl) && !hasAudioExtension(previewUrl) ? previewUrl : "",
    storageUrl: stableStorageUrl,
    ...(storageObjectId ? { storageObjectId } : {}),
    mimeType,
    width: Number(asset.width ?? asset.latestVersion?.metadata?.width) || undefined,
    height: Number(asset.height ?? asset.latestVersion?.metadata?.height) || undefined,
    durationSeconds: Number(asset.durationSeconds ?? asset.duration ?? asset.latestVersion?.metadata?.durationSeconds) || undefined,
    cloud: true,
    reusable: true,
    element: null,
  };
}

export function normalizeCloudAssetEntries(payload, source = "personal-library") {
  return rowsFromCloudPayload(payload)
    .map((asset, index) => normalizeCloudAsset(asset, source, index))
    .filter(Boolean);
}

function cloudPayloadTotalPages(payload) {
  const meta = payload?.meta ?? payload?.pagination ?? payload?.data?.meta ?? payload?.data?.pagination ?? {};
  const explicitTotalPages = Number(meta.totalPages ?? meta.total_pages);
  if (Number.isFinite(explicitTotalPages) && explicitTotalPages > 0) {
    return Math.floor(explicitTotalPages);
  }
  const total = Number(meta.total ?? meta.totalCount ?? meta.total_count);
  const pageSize = Number(meta.pageSize ?? meta.page_size);
  return Number.isFinite(total) && total > 0 && Number.isFinite(pageSize) && pageSize > 0
    ? Math.max(1, Math.ceil(total / pageSize))
    : 1;
}

async function loadCanvasPersonalMediaPages(assetClient) {
  const pageSize = 100;
  const pageConcurrency = 4;
  const firstPage = await assetClient.getPersonalMediaLibrary({ media: "all", range: "all", page: 1, pageSize });
  const totalPages = cloudPayloadTotalPages(firstPage);
  const remainingPages = Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => index + 2);
  const payloads = [firstPage];
  let failedPages = 0;
  for (let offset = 0; offset < remainingPages.length; offset += pageConcurrency) {
    const batch = remainingPages.slice(offset, offset + pageConcurrency);
    const settled = await Promise.allSettled(batch.map((page) => (
      assetClient.getPersonalMediaLibrary({ media: "all", range: "all", page, pageSize })
    )));
    settled.forEach((result) => {
      if (result.status === "fulfilled") payloads.push(result.value);
      else failedPages += 1;
    });
  }
  const seen = new Set();
  const entries = payloads.flatMap((payload) => normalizeCloudAssetEntries(payload, "personal-library"))
    .filter((entry) => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    });
  return {
    entries,
    errors: failedPages ? [`个人素材有 ${failedPages} 页加载失败。`] : [],
  };
}

export async function loadCanvasCloudAssets(assetClient) {
  const requests = [];
  if (typeof assetClient?.getPersonalMediaLibrary === "function") {
    requests.push({
      source: "personal-library",
      normalized: true,
      promise: Promise.resolve().then(() => loadCanvasPersonalMediaPages(assetClient)),
    });
  }
  if (typeof assetClient?.getLibraryAssets === "function") {
    requests.push({
      source: "official-library",
      promise: Promise.resolve().then(() => assetClient.getLibraryAssets({ scope: "official" })),
    });
    requests.push({
      source: "team-library",
      promise: Promise.resolve().then(() => assetClient.getLibraryAssets({ scope: "team" })),
    });
  }
  if (!requests.length) {
    return { entries: [], errors: ["当前环境暂不支持云端素材库。"] };
  }
  const settled = await Promise.allSettled(requests.map((request) => request.promise));
  const entries = [];
  const errors = [];
  settled.forEach((result, index) => {
    const request = requests[index];
    if (result.status === "fulfilled") {
      if (request.normalized) {
        entries.push(...result.value.entries);
        errors.push(...result.value.errors);
      } else {
        entries.push(...normalizeCloudAssetEntries(result.value, request.source));
      }
      return;
    }
    errors.push({
      "personal-library": "个人素材加载失败。",
      "official-library": "官方素材加载失败。",
      "team-library": "团队素材加载失败。",
    }[request.source] ?? "云端素材加载失败。");
  });
  return { entries, errors };
}

function normalizeResourceRows(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["data", "items", "assets", "resources", "styles", "records", "results"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
    if (Array.isArray(payload?.data?.[key])) return payload.data[key];
  }
  return [];
}

function resourceCategory(asset) {
  const value = firstText(asset?.category, asset?.assetType, asset?.kind, asset?.resourceType, asset?.type).toLowerCase();
  if (["character", "role", "person", "人物"].includes(value)) return "character";
  if (["scene", "background", "environment", "场景"].includes(value)) return "scene";
  if (["prop", "object", "道具"].includes(value)) return "prop";
  return value || "asset";
}

function resourceUrl(asset, keys = []) {
  return firstText(
    ...keys.map((key) => asset?.[key]),
    asset?.latestVersion?.metadata?.sourceUrl,
    asset?.latestVersion?.metadata?.url,
    asset?.latestVersion?.storageUrl,
    asset?.latestVersion?.url,
    asset?.latestVersion?.previewUrl,
  );
}

export function normalizeCanvasResourceEntries(payload, source = "official-library") {
  const sourceLabel = {
    "official-library": "官方资源",
    "team-library": "团队资源",
    "personal-library": "个人资源",
  }[source] ?? "云端资源";
  return normalizeResourceRows(payload).flatMap((asset, index) => {
    if (!asset || typeof asset !== "object") return [];
    const previewUrl = resourceUrl(asset, ["thumbnailUrl", "previewUrl", "preview", "coverImageUrl", "cover_image_url", "fixedImageUrl", "imageUrl"]);
    const storageUrl = resourceUrl(asset, ["downloadUrl", "storageUrl", "sourceUrl", "fileUrl", "mediaUrl", "url", "imageUrl"]);
    const url = storageUrl || previewUrl;
    const category = resourceCategory(asset);
    const sourceId = firstText(asset.id, asset.assetId, asset.resourceId, asset.mediaId, `${index + 1}`);
    const storageObjectId = firstText(
      asset.storageObjectId,
      asset.storage_object_id,
      asset.latestVersion?.storageObjectId,
      asset.latestVersion?.storage_object_id,
      asset.latestVersion?.metadata?.storageObjectId,
      asset.latestVersion?.metadata?.storage_object_id,
    );
    const stableStorageUrl = storageObjectContentUrl(storageObjectId) || url;
    if (!stableStorageUrl) return [];
    const mimeType = firstText(asset.mimeType, asset.contentType, asset.latestVersion?.mimeType, "image/png");
    return [{
      id: `resource:${source}:${sourceId}`,
      sourceId,
      source,
      sourceLabel,
      sourceAction: firstText(asset.sourceAction, asset.source, "library"),
      resourceType: "asset",
      resourceCategory: category,
      assetCategory: normalizeCanvasAssetCategory({ ...asset, resourceCategory: category }, mimeType.split("/", 1)[0]),
      folder: firstText(asset.folder, asset.folderName, asset.groupName, asset.collectionName),
      type: mimeType.toLowerCase().startsWith("video/") ? "video" : mimeType.toLowerCase().startsWith("audio/") ? "audio" : "image",
      category: mimeType.toLowerCase().startsWith("video/") ? "video" : mimeType.toLowerCase().startsWith("audio/") ? "audio" : "image",
      kindLabel: category === "character" ? "角色" : category === "scene" ? "场景" : category === "prop" ? "道具" : "素材",
      title: firstText(asset.name, asset.title, asset.fileName, asset.assetName, asset.label, asset.assetKey, `${sourceLabel} ${index + 1}`),
      mediaUrl: storageObjectContentUrl(storageObjectId) || previewUrl || url,
      previewUrl: previewUrl || stableStorageUrl,
      thumbnailUrl: previewUrl || stableStorageUrl,
      storageUrl: stableStorageUrl,
      ...(storageObjectId ? { storageObjectId } : {}),
      mimeType,
      width: Number(asset.width ?? asset.latestVersion?.metadata?.width) || undefined,
      height: Number(asset.height ?? asset.latestVersion?.metadata?.height) || undefined,
      prompt: firstText(asset.prompt, asset.assetPrompt, asset.description, asset.latestVersion?.metadata?.prompt),
      cloud: true,
      reusable: true,
      element: null,
    }];
  });
}

export function normalizeCanvasStyleEntries(payload, source = "official-style") {
  const sourceLabel = source === "batch-style" ? "批量风格" : "官方风格";
  return normalizeResourceRows(payload).flatMap((style, index) => {
    if (!style || typeof style !== "object") return [];
    const id = firstText(style.id, style.code, style.styleId, `${index + 1}`);
    const title = firstText(style.name, style.label, style.title, style.code);
    const prompt = firstText(style.prompt_content, style.promptContent, style.prompt, style.description);
    if (!id || !title) return [];
    const previewUrl = resourceUrl(style, ["coverImageUrl", "cover_image_url", "previewUrl", "preview", "thumbnailUrl", "imageUrl"]);
    return [{
      id: `style:${source}:${id}`,
      sourceId: id,
      source,
      sourceLabel,
      sourceAction: "style-preset",
      resourceType: "style",
      resourceCategory: "style",
      assetCategory: "style",
      type: "style",
      category: "style",
      kindLabel: "风格",
      title,
      code: firstText(style.code, id),
      prompt,
      promptContent: prompt,
      mediaUrl: previewUrl,
      previewUrl,
      thumbnailUrl: previewUrl,
      storageUrl: previewUrl,
      mimeType: "image/*",
      cloud: true,
      reusable: true,
      element: null,
    }];
  });
}

export async function loadCanvasResourceLibrary(assetClient) {
  const requests = [];
  if (typeof assetClient?.getLibraryAssets === "function") {
    requests.push({ source: "official-library", label: "官方资源", promise: Promise.resolve().then(() => assetClient.getLibraryAssets({ scope: "official" })) });
    requests.push({ source: "team-library", label: "团队资源", promise: Promise.resolve().then(() => assetClient.getLibraryAssets({ scope: "team" })) });
  }
  const styleRequests = [];
  if (typeof assetClient?.getProjectStyles === "function") {
    styleRequests.push({ source: "official-style", promise: Promise.resolve().then(() => assetClient.getProjectStyles()) });
  }
  if (typeof assetClient?.getBatchImageStyles === "function") {
    styleRequests.push({ source: "batch-style", promise: Promise.resolve().then(() => assetClient.getBatchImageStyles()) });
  }
  const [assetSettled, styleSettled] = await Promise.all([
    Promise.allSettled(requests.map((request) => request.promise)),
    Promise.allSettled(styleRequests.map((request) => request.promise)),
  ]);
  const entries = [];
  const styles = [];
  const errors = [];
  assetSettled.forEach((result, index) => {
    const request = requests[index];
    if (result.status === "fulfilled") entries.push(...normalizeCanvasResourceEntries(result.value, request.source));
    else errors.push(`${request.label}加载失败。`);
  });
  styleSettled.forEach((result, index) => {
    const request = styleRequests[index];
    if (result.status === "fulfilled") styles.push(...normalizeCanvasStyleEntries(result.value, request.source));
    else errors.push(`${request.source === "batch-style" ? "批量风格" : "官方风格"}加载失败。`);
  });
  return { entries, styles, errors };
}

function normalizeHistoryArtifact(artifact, run = null, index = 0) {
  if (!artifact || typeof artifact !== "object") return null;
  const type = normalizeCloudMediaType({
    ...artifact,
    mediaKind: artifact.artifactKind ?? run?.mediaKind,
    mimeType: artifact.mimeType ?? artifact.metadata?.mimeType,
  });
  if (!type) return null;
  const storageUrl = firstText(
    artifact.url,
    artifact.storageUrl,
    artifact.sourceUrl,
    artifact.metadata?.sourceUrl,
    artifact.metadata?.url,
  );
  const thumbnailUrl = firstText(
    artifact.thumbnailUrl,
    artifact.previewUrl,
    artifact.metadata?.thumbnailUrl,
    artifact.metadata?.previewUrl,
  );
  const artifactId = firstText(artifact.id, artifact.artifactId);
  if (!artifactId) return null;
  const createdAt = firstText(artifact.createdAt, run?.createdAt);
  const storageObjectId = firstText(
    artifact.storageObjectId,
    artifact.storage_object_id,
    artifact.metadata?.storageObjectId,
    artifact.metadata?.storage_object_id,
  );
  const stableStorageUrl = storageObjectContentUrl(storageObjectId) || storageUrl || (type === "image" ? thumbnailUrl : "");
  if (!stableStorageUrl) return null;
  return {
    id: artifactId,
    sourceId: artifactId,
    runId: firstText(artifact.runId, run?.id),
    runNo: Number(run?.runNo) || undefined,
    runStatus: firstText(run?.status),
    source: "generation-history",
    sourceLabel: "生成历史",
    sourceAction: "generated",
    type,
    category: type,
    kindLabel: labelFor(type),
    title: firstText(
      artifact.title,
      artifact.metadata?.title,
      artifact.metadata?.prompt,
      run?.inputSnapshot?.prompt,
      `${labelFor(type)}结果 ${index + 1}`,
    ),
    mediaUrl: storageObjectContentUrl(storageObjectId) || storageUrl || (type === "image" ? thumbnailUrl : ""),
    previewUrl: thumbnailUrl || stableStorageUrl,
    thumbnailUrl,
    storageUrl: stableStorageUrl,
    ...(storageObjectId ? { storageObjectId } : {}),
    mimeType: firstText(
      artifact.mimeType,
      artifact.metadata?.mimeType,
      type === "video" ? "video/mp4" : "image/png",
    ),
    width: Number(artifact.width ?? artifact.metadata?.width) || undefined,
    height: Number(artifact.height ?? artifact.metadata?.height) || undefined,
    durationSeconds: Number(artifact.durationSeconds ?? artifact.metadata?.durationSeconds) || undefined,
    selected: Boolean(artifact.selected),
    selectionRole: firstText(artifact.selectionRole, "current"),
    createdAt,
    cloud: true,
    reusable: true,
    element: null,
  };
}

const CANVAS_HISTORY_TERMINAL_FAILURES = new Set([
  "failed",
  "canceled",
  "cancelled",
  "manual_review_required",
  "result_unknown",
]);

export function normalizeCanvasHistoryRun(run, index = 0, nodeKey = "") {
  const status = firstText(run?.status).toLowerCase();
  const mediaKind = firstText(run?.mediaKind).toLowerCase();
  const type = ["image", "video", "audio"].includes(mediaKind) ? mediaKind : "image";
  const failure = run?.failure && typeof run.failure === "object" ? run.failure : {};
  return {
    ...run,
    id: firstText(run?.id, `run-${index + 1}`),
    nodeKey: firstText(run?.nodeKey, nodeKey),
    status,
    type,
    kindLabel: labelFor(type),
    terminalFailure: CANVAS_HISTORY_TERMINAL_FAILURES.has(status),
    failureMessage: firstText(
      failure.displayMessage,
      failure.message,
      failure.errorMessage,
      run?.outputSnapshot?.displayMessage,
      run?.outputSnapshot?.error,
      status === "canceled" || status === "cancelled" ? "生成任务已取消。" : "生成失败，请检查输入后重新生成。",
    ),
  };
}

export function listCanvasFailedHistoryRuns(runs) {
  return (Array.isArray(runs) ? runs : [])
    .map((run, index) => normalizeCanvasHistoryRun(run, index, run?.nodeKey))
    .filter((run) => run.terminalFailure && !(Array.isArray(run.artifacts) && run.artifacts.length));
}

export function normalizeCanvasNodeHistory(payload, nodeKey = "") {
  const source = payload?.history ?? payload?.data ?? payload ?? {};
  const runs = (Array.isArray(source.runs) ? source.runs : [])
    .map((run, index) => normalizeCanvasHistoryRun(run, index, nodeKey));
  const candidates = [];
  for (const run of runs) {
    for (const artifact of Array.isArray(run?.artifacts) ? run.artifacts : []) {
      candidates.push({ artifact, run });
    }
  }
  for (const artifact of Array.isArray(source.artifacts) ? source.artifacts : []) {
    const run = runs.find((item) => String(item?.id ?? "") === String(artifact?.runId ?? ""));
    candidates.push({ artifact, run });
  }
  for (const artifact of Array.isArray(source.orphanArtifacts) ? source.orphanArtifacts : []) {
    candidates.push({ artifact, run: null });
  }
  const seen = new Set();
  const artifacts = candidates.flatMap(({ artifact, run }, index) => {
    const normalized = normalizeHistoryArtifact(artifact, run, index);
    if (!normalized || seen.has(normalized.id)) return [];
    seen.add(normalized.id);
    return [normalized];
  });
  return {
    nodeKey: firstText(nodeKey),
    runs,
    artifacts,
  };
}

export async function loadCanvasNodeHistory(historyClient, { canvasProjectId, nodeKey } = {}) {
  const internalCanvasProjectId = firstText(canvasProjectId);
  const normalizedNodeKey = firstText(nodeKey);
  if (!internalCanvasProjectId || !normalizedNodeKey) {
    return { nodeKey: normalizedNodeKey, runs: [], artifacts: [] };
  }
  if (typeof historyClient?.listCanvasNodeRuns !== "function") {
    throw new Error("canvas node history unavailable");
  }
  const payload = await historyClient.listCanvasNodeRuns(internalCanvasProjectId, normalizedNodeKey);
  return normalizeCanvasNodeHistory(payload, normalizedNodeKey);
}

export async function loadCanvasGenerationHistory(historyClient, { canvasProjectId, nodeKeys = [] } = {}) {
  const normalizedNodeKeys = Array.from(new Set((Array.isArray(nodeKeys) ? nodeKeys : [])
    .map((nodeKey) => firstText(nodeKey))
    .filter(Boolean)));
  if (!firstText(canvasProjectId) || !normalizedNodeKeys.length) {
    return { nodeKey: "*", runs: [], artifacts: [], errors: [] };
  }
  const settled = await Promise.allSettled(normalizedNodeKeys.map((nodeKey) => loadCanvasNodeHistory(historyClient, {
    canvasProjectId,
    nodeKey,
  })));
  const runs = [];
  const artifacts = [];
  const errors = [];
  const seen = new Set();
  settled.forEach((result, index) => {
    const nodeKey = normalizedNodeKeys[index];
    if (result.status === "rejected") {
      errors.push(nodeKey);
      return;
    }
    runs.push(...result.value.runs.map((run) => ({ ...run, nodeKey })));
    result.value.artifacts.forEach((artifact) => {
      const key = `${nodeKey}:${artifact.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      artifacts.push({ ...artifact, nodeKey, historyKey: key });
    });
  });
  return { nodeKey: "*", runs, artifacts, errors };
}

export function markCanvasHistoryArtifactSelected(artifacts, entry, fallbackNodeKey = "") {
  const selectedNodeKey = firstText(entry?.nodeKey, fallbackNodeKey);
  return (Array.isArray(artifacts) ? artifacts : []).map((artifact) => {
    const artifactNodeKey = firstText(artifact?.nodeKey, fallbackNodeKey);
    if (selectedNodeKey && artifactNodeKey !== selectedNodeKey) return artifact;
    const selected = artifact.id === entry?.id;
    return {
      ...artifact,
      selected: selected || (artifact.selectionRole === "current" ? false : artifact.selected),
      selectionRole: selected ? "current" : artifact.selectionRole,
    };
  });
}

export function applyCanvasNodeArtifactSelection(elements = [], nodeKey, artifact) {
  const normalizedNodeKey = firstText(nodeKey);
  const resultUrl = resolveCanvasAssetContentUrl(artifact);
  if (!normalizedNodeKey || !artifact?.id || !resultUrl) return elements;
  let changed = false;
  const nextElements = elements.map((element) => {
    if (element?.id !== normalizedNodeKey || element.isDeleted) return element;
    if (!["image-generator", "video-generator", "audio-node"].includes(element.customData?.type)) return element;
    changed = true;
    return {
      ...element,
      customData: {
        ...(element.customData ?? {}),
        status: "completed",
        resultUrl,
        resultUrls: [resultUrl],
        resultMimeType: firstText(artifact.mimeType) || null,
        resultMediaKind: firstText(artifact.type, artifact.mediaKind) || null,
        resultStorageObjectId: firstText(
          artifact.storageObjectId,
          artifact.storage_object_id,
          artifact.metadata?.storageObjectId,
          artifact.metadata?.storage_object_id,
        ) || null,
        selectedArtifactId: firstText(artifact.id),
        selectedArtifactRunId: firstText(artifact.runId) || null,
        error: "",
      },
      version: (element.version ?? 1) + 1,
      versionNonce: Math.floor(Math.random() * 2_000_000_000),
      updated: Date.now(),
    };
  });
  return changed ? nextElements : elements;
}

export function buildCloudAssetCustomData(entry, existing = {}) {
  const storageUrl = resolveCanvasAssetContentUrl(entry);
  return {
    ...existing,
    title: entry.title,
    storageUrl,
    ...(entry.storageObjectId ? { storageObjectId: entry.storageObjectId } : {}),
    source: entry.source,
    sourceId: entry.sourceId,
    sourceAction: entry.sourceAction || undefined,
    mimeType: entry.mimeType,
    ...(entry.type ? { mediaKind: entry.type } : {}),
    ...(entry.resourceType ? { resourceType: entry.resourceType } : {}),
    ...(entry.resourceCategory ? { resourceCategory: entry.resourceCategory } : {}),
    ...(entry.assetCategory ? { assetCategory: entry.assetCategory } : {}),
    ...(entry.folder ? { resourceFolder: entry.folder } : {}),
    ...(entry.prompt ? { resourcePrompt: entry.prompt } : {}),
    sourceKind: entry.sourceAction === "generated" || entry.source === "generated" ? "generated" : "upload",
    cloudArchiveStatus: "archived",
  };
}

export async function insertCloudAssetOnCanvas(api, entry, options = {}) {
  const storageUrl = resolveCanvasAssetContentUrl(entry);
  if (!api || !entry?.cloud || !storageUrl) return null;
  const shouldInsert = typeof options.shouldInsert === "function" ? options.shouldInsert : () => true;
  if (!shouldInsert()) return null;
  const { insertImageOnCanvas, insertVideoOnCanvas } = await import("../loomic-core/canvas-elements.js");
  const { createUploadedAudioNodeElement } = await import("../loomic-core/workflow-node-elements.js");
  if (!shouldInsert()) return null;
  const artifact = {
    url: storageUrl,
    title: entry.title,
    mimeType: entry.mimeType,
    width: entry.width,
    height: entry.height,
    durationSeconds: entry.durationSeconds,
    storageObjectId: entry.storageObjectId,
  };
  const elementId = entry.type === "audio"
    ? createUploadedAudioNodeElement(api, {
      title: entry.title,
      fileName: entry.title,
      mediaUrl: storageUrl,
      storageUrl,
      storageObjectId: entry.storageObjectId,
      source: entry.source,
      sourceAction: entry.sourceAction,
      mimeType: entry.mimeType,
      durationSeconds: entry.durationSeconds,
      cloudArchiveStatus: "archived",
    })
    : entry.type === "video"
      ? await insertVideoOnCanvas(api, artifact, { shouldInsert })
      : await insertImageOnCanvas(api, artifact, { shouldInsert });
  if (!elementId) return null;
  if (!shouldInsert()) return null;
  const elements = api.getSceneElements?.() ?? [];
  const element = elements.find((item) => item.id === elementId);
  if (!element) return elementId;
  const anchor = options.anchor;
  const anchoredElement = Number.isFinite(anchor?.x) && Number.isFinite(anchor?.y)
    ? {
      ...element,
      x: anchor.x - (Number(element.width) || 0) / 2,
      y: anchor.y - (Number(element.height) || 0) / 2,
    }
    : element;
  const updatedElement = {
    ...anchoredElement,
    customData: buildCloudAssetCustomData(entry, element.customData),
  };
  api.updateScene?.({
    elements: elements.map((item) => item.id === elementId ? updatedElement : item),
    appState: { selectedElementIds: { [elementId]: true } },
    captureUpdate: "IMMEDIATELY",
  });
  if (!anchor) api.scrollToContent?.(updatedElement, { fitToContent: false, animate: true, duration: 250 });
  return elementId;
}

export function collectCanvasFileEntries(elements = [], binaryFiles = {}) {
  let index = 0;
  return elements.flatMap((element) => {
    if (!element || element.isDeleted) return [];
    const type = getCanvasFileType(element);
    if (!type) return [];
    index += 1;
    const binary = element.fileId ? binaryFiles[element.fileId] : null;
    const storageObjectId = firstText(element.customData?.storageObjectId, element.customData?.resultStorageObjectId);
    const stableStorageUrl = storageObjectContentUrl(storageObjectId);
    const mediaUrl = stableStorageUrl || (type === "video"
      ? element.link
      : type === "audio"
        ? element.customData?.mediaUrl || element.customData?.storageUrl || ""
        : binary?.dataURL || element.customData?.storageUrl || element.customData?.resultUrl || "");
    const customSource = String(element.customData?.source ?? "");
    const source = ["personal-library", "official-library", "team-library"].includes(customSource)
      ? customSource
      : customSource === "generated" || (type === "video" && element.customData?.sourceKind !== "upload") ? "generated" : "uploaded";
    return [{
      id: element.id,
      element,
      type,
      category: categoryFor(type),
      assetCategory: normalizeCanvasAssetCategory(element.customData, type),
      kindLabel: labelFor(type),
      title: titleFor(element, type, index),
      folder: firstText(element.customData?.canvasFolder),
      mediaUrl,
      storageUrl: stableStorageUrl || element.customData?.storageUrl || element.customData?.resultUrl || mediaUrl,
      ...(storageObjectId ? { storageObjectId } : {}),
      mimeType: binary?.mimeType || element.customData?.mimeType || (type === "video" ? "video/mp4" : type === "audio" ? "audio/mpeg" : "image/png"),
      source,
      sourceLabel: {
        "personal-library": "个人素材",
        "official-library": "官方素材",
        "team-library": "团队素材",
      }[source],
      reusable: ["image", "video", "audio"].includes(type),
    }];
  }).reverse();
}

const CANVAS_PANEL_KIND_LABELS = {
  "director-node": "导演台",
  "video-composition-node": "视频合成",
  "script-node": "脚本",
  text: "文本",
  rectangle: "矩形",
  ellipse: "椭圆",
  diamond: "菱形",
  line: "直线",
  freedraw: "画笔",
  frame: "画框",
  embeddable: "嵌入内容",
};

export function collectCanvasPanelEntries(elements = [], binaryFiles = {}) {
  const filesById = new Map(collectCanvasFileEntries(elements, binaryFiles).map((entry) => [entry.id, entry]));
  return elements.flatMap((element, index) => {
    if (!element || element.isDeleted || element.type === "arrow") return [];
    const fileEntry = filesById.get(element.id);
    if (fileEntry) return [{ ...fileEntry, panelOnly: false, panelType: element.customData?.type || element.type }];
    const panelType = firstText(element.customData?.type, element.type, "node");
    const kindLabel = CANVAS_PANEL_KIND_LABELS[panelType] || CANVAS_PANEL_KIND_LABELS[element.type] || "画布节点";
    const title = firstText(
      element.customData?.canvasFileName,
      element.customData?.title,
      element.customData?.label,
      element.customData?.prompt,
      element.text,
      `${kindLabel} ${index + 1}`,
    );
    return [{
      id: element.id,
      element,
      type: "canvas-node",
      category: "node",
      kindLabel,
      title,
      source: "canvas",
      panelOnly: true,
      panelType,
      reusable: false,
    }];
  }).reverse();
}

export function filterCanvasFileEntries(entries, { query = "", type = "all", source = "all", assetCategory = "all" } = {}) {
  const normalizedQuery = String(query).trim().toLocaleLowerCase();
  return entries.filter((entry) => {
    if (type !== "all" && entry.category !== type) return false;
    if (assetCategory !== "all" && entry.assetCategory !== assetCategory) return false;
    if (source === "canvas-local" && entry.cloud) return false;
    if (source !== "all" && source !== "canvas-local" && entry.source !== source) return false;
    if (!normalizedQuery) return true;
    const sourceLabel = entry.source === "generated" ? "生成" : entry.source === "uploaded" ? "上传" : "";
    return `${entry.title} ${entry.folder ?? ""} ${entry.kindLabel} ${entry.source} ${entry.sourceLabel ?? ""} ${sourceLabel}`.toLocaleLowerCase().includes(normalizedQuery);
  });
}

export function normalizeCanvasFolderName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 50);
}

export function listCanvasFolders(entries = []) {
  return Array.from(new Set(entries.map((entry) => normalizeCanvasFolderName(entry?.folder)).filter(Boolean)))
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
}

export function updateCanvasFileMetadata(elements = [], elementId, updates = {}) {
  const normalizedId = String(elementId ?? "").trim();
  if (!normalizedId) return elements;
  let changed = false;
  const nextElements = elements.map((element) => {
    if (element?.id !== normalizedId || element.isDeleted || !getCanvasFileType(element)) return element;
    const customData = { ...(element.customData ?? {}) };
    if (Object.prototype.hasOwnProperty.call(updates, "folder")) {
      const folder = normalizeCanvasFolderName(updates.folder);
      if (folder) customData.canvasFolder = folder;
      else delete customData.canvasFolder;
    }
    if (Object.prototype.hasOwnProperty.call(updates, "title")) {
      const title = String(updates.title ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
      if (title) customData.canvasFileName = title;
      else delete customData.canvasFileName;
    }
    if (JSON.stringify(customData) === JSON.stringify(element.customData ?? {})) return element;
    changed = true;
    return {
      ...element,
      customData,
      version: (element.version ?? 1) + 1,
      versionNonce: Math.floor(Math.random() * 2_000_000_000),
      updated: Date.now(),
    };
  });
  return changed ? nextElements : elements;
}

export function updateCanvasFilesMetadata(elements = [], elementIds = [], updates = {}) {
  const ids = new Set(Array.from(elementIds ?? [], (id) => String(id ?? "").trim()).filter(Boolean));
  if (!ids.size) return elements;
  let result = elements;
  for (const element of elements) {
    if (!ids.has(element?.id)) continue;
    result = updateCanvasFileMetadata(result, element.id, updates);
  }
  return result;
}

export async function runCanvasAssetBatch(items = [], action, options = {}) {
  const shouldContinue = typeof options.shouldContinue === "function" ? options.shouldContinue : () => true;
  const results = [];
  for (const item of Array.from(items ?? [])) {
    if (!shouldContinue()) break;
    try {
      const value = await action(item, { shouldContinue });
      if (!shouldContinue()) break;
      const values = Array.isArray(value) ? value : [value];
      results.push(values.length > 0 && values.every((result) => result !== false));
    } catch {
      if (!shouldContinue()) break;
      results.push(false);
    }
    if (!shouldContinue()) break;
  }
  return results;
}

export function renameCanvasFolder(elements = [], currentName, nextName) {
  const current = normalizeCanvasFolderName(currentName);
  const next = normalizeCanvasFolderName(nextName);
  if (!current || !next || current === next) return elements;
  let result = elements;
  for (const element of elements) {
    if (normalizeCanvasFolderName(element?.customData?.canvasFolder) !== current) continue;
    result = updateCanvasFileMetadata(result, element.id, { folder: next });
  }
  return result;
}

export function removeCanvasFolder(elements = [], folderName) {
  const folder = normalizeCanvasFolderName(folderName);
  if (!folder) return elements;
  let result = elements;
  for (const element of elements) {
    if (normalizeCanvasFolderName(element?.customData?.canvasFolder) !== folder) continue;
    result = updateCanvasFileMetadata(result, element.id, { folder: "" });
  }
  return result;
}

export function filterCanvasResourceEntries(entries, { query = "", category = "all", source = "all" } = {}) {
  const normalizedQuery = String(query).trim().toLocaleLowerCase();
  return entries.filter((entry) => {
    if (category !== "all" && entry.resourceCategory !== category && entry.resourceType !== category) return false;
    if (source !== "all" && entry.source !== source) return false;
    if (!normalizedQuery) return true;
    return [entry.title, entry.kindLabel, entry.sourceLabel, entry.folder, entry.prompt, entry.code]
      .map((value) => String(value ?? ""))
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalizedQuery);
  });
}

export function mergeCanvasStylePrompt(prompt, stylePrompt, previousStylePrompt = "") {
  let current = firstText(prompt);
  const preset = firstText(stylePrompt);
  const previous = firstText(previousStylePrompt);
  if (previous && previous !== preset) {
    const taggedPrevious = `风格要求：${previous}`;
    current = current === previous || current === taggedPrevious
      ? ""
      : current.replace(`\n\n${taggedPrevious}`, "").replace(taggedPrevious, "").trim();
  }
  if (!preset || current.includes(preset)) return current;
  return current ? `${current}\n\n风格要求：${preset}` : preset;
}

function generateCanvasId() {
  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`.slice(0, 20);
}

export function duplicateCanvasMediaElement(element, appState = {}) {
  if (!element || !["image", "video", "audio"].includes(getCanvasFileType(element))) return null;
  const zoom = appState.zoom?.value ?? 1;
  const centerX = -(appState.scrollX ?? 0) + (appState.width ?? 0) / (2 * zoom);
  const centerY = -(appState.scrollY ?? 0) + (appState.height ?? 0) / (2 * zoom);
  return {
    ...element,
    id: generateCanvasId(),
    x: centerX - (element.width ?? 0) / 2,
    y: centerY - (element.height ?? 0) / 2,
    boundElements: null,
    frameId: null,
    groupIds: [],
    index: null,
    version: 1,
    versionNonce: Math.floor(Math.random() * 2_000_000_000),
    seed: Math.floor(Math.random() * 2_000_000_000),
    updated: Date.now(),
    isDeleted: false,
  };
}
