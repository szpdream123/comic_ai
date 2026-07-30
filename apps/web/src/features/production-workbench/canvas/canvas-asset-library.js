function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function canvasAssetsFromGenerationHistory(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const assets = [];
  const seen = new Set();
  for (const run of items) {
    const artifacts = Array.isArray(run?.artifacts) ? run.artifacts : [];
    for (const rawArtifact of artifacts) {
      const artifact = asRecord(rawArtifact);
      const metadata = asRecord(artifact.metadata ?? artifact.metadata_json);
      const id = text(artifact.id);
      const storageObjectId = text(artifact.storageObjectId ?? artifact.storage_object_id);
      const dedupeKey = id || storageObjectId;
      if (!dedupeKey || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const kind = text(artifact.artifactKind ?? artifact.artifact_kind ?? run?.mediaKind) || "image";
      const normalizedKind = kind.toLowerCase();
      const directMediaUrl = text(
        artifact.url
          ?? artifact.videoUrl
          ?? artifact.video_url
          ?? artifact.sourceUrl
          ?? artifact.source_url
          ?? artifact.downloadUrl
          ?? artifact.download_url
          ?? metadata.videoUrl
          ?? metadata.video_url
          ?? metadata.sourceUrl
          ?? metadata.downloadUrl
          ?? metadata.url,
      );
      const storageProxyUrl = storageObjectId
        ? `/api/storage/objects/${encodeURIComponent(storageObjectId)}/content?proxy=1`
        : "";
      const url = text(
        normalizedKind === "video"
          ? directMediaUrl || artifact.thumbnailUrl || artifact.thumbnail_url || metadata.previewUrl || storageProxyUrl
          : artifact.thumbnailUrl ?? artifact.thumbnail_url ?? artifact.url ?? metadata.previewUrl ?? metadata.url,
      );
      const thumbnailUrl = text(
        artifact.thumbnailUrl
          ?? artifact.thumbnail_url
          ?? metadata.previewUrl
          ?? metadata.thumbnailUrl
          ?? metadata.thumbnail_url,
      );
      assets.push({
        id: dedupeKey,
        source: "outputs",
        runId: text(run?.id) || null,
        artifactId: id || null,
        storageObjectId: storageObjectId || null,
        assetId: text(artifact.assetId ?? artifact.asset_id) || null,
        assetVersionId: text(artifact.assetVersionId ?? artifact.asset_version_id) || null,
        kind: normalizedKind,
        title: text(metadata.title ?? metadata.fileName ?? metadata.name) || `${text(run?.nodeKey) || "生成"}产物`,
        meta: `${kind} · ${text(run?.modelCode) || "Canvas"}`,
        status: artifact.selected === true ? "已选" : "可用",
        createdAt: text(run?.createdAt) || null,
        tags: Array.isArray(metadata.tags)
          ? [...new Set(metadata.tags.map((tag) => text(tag)).filter(Boolean))]
          : [],
        url,
        previewUrl: url,
        ...(normalizedKind === "video" && thumbnailUrl && thumbnailUrl !== url ? { posterUrl: thumbnailUrl } : {}),
      });
    }
  }
  return assets;
}

export function canvasAssetNodeData(asset) {
  const source = asRecord(asset);
  const kind = text(source.kind) || "image";
  const url = text(source.url ?? source.previewUrl);
  return {
    source: "canvas_artifact",
    status: "ready",
    mediaKind: kind === "video" || kind === "audio" ? kind : "image",
    title: text(source.title) || "画布产物",
    fileName: text(source.title) || "画布产物",
    artifactId: text(source.artifactId ?? source.id) || null,
    storageObjectId: text(source.storageObjectId) || null,
    assetId: text(source.assetId) || null,
    assetVersionId: text(source.assetVersionId) || null,
    ...(url ? { url, previewUrl: url } : {}),
    ...(text(source.posterUrl) ? { posterUrl: text(source.posterUrl) } : {}),
  };
}
