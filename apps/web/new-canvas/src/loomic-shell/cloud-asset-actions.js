const MANAGED_SOURCES = new Set(["team-library", "project-library", "episode-asset"]);

function isTeamMember(actor) {
  return actor?.actorType === "team_member" || Boolean(actor?.teamMember?.id);
}

export function canvasCloudAssetCapabilities(entry, assetClient, actor, context = {}) {
  const source = String(entry?.source ?? "");
  const authenticated = Boolean(actor?.id);
  if (!authenticated || !MANAGED_SOURCES.has(source)) {
    return { canRename: false, canDelete: false };
  }
  if (source === "team-library") {
    return {
      canRename: typeof assetClient?.updateTeamAsset === "function",
      canDelete: !isTeamMember(actor) && typeof assetClient?.deleteTeamAsset === "function",
    };
  }
  if (source === "project-library") {
    return {
      canRename: typeof assetClient?.updateProjectAsset === "function",
      canDelete: !isTeamMember(actor) && typeof assetClient?.deleteProjectAsset === "function",
    };
  }
  const hasEpisode = Boolean(String(context.episodeId ?? "").trim());
  return {
    canRename: hasEpisode && typeof assetClient?.updateEpisodeAsset === "function",
    canDelete: hasEpisode && !isTeamMember(actor) && typeof assetClient?.deleteEpisodeAsset === "function",
  };
}

function requireAssetId(entry) {
  const assetId = String(entry?.sourceId ?? "").trim();
  if (!assetId) throw new Error("cloud_asset_id_missing");
  return assetId;
}

export async function renameCanvasCloudAsset(assetClient, entry, title, context = {}) {
  const assetId = requireAssetId(entry);
  const normalizedTitle = String(title ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  if (!normalizedTitle) throw new Error("cloud_asset_name_required");
  if (entry.source === "team-library" && typeof assetClient?.updateTeamAsset === "function") {
    await assetClient.updateTeamAsset(assetId, { name: normalizedTitle });
    return normalizedTitle;
  }
  if (entry.source === "project-library" && typeof assetClient?.updateProjectAsset === "function") {
    await assetClient.updateProjectAsset(assetId, { name: normalizedTitle });
    return normalizedTitle;
  }
  const episodeId = String(context.episodeId ?? "").trim();
  if (entry.source === "episode-asset" && episodeId && typeof assetClient?.updateEpisodeAsset === "function") {
    await assetClient.updateEpisodeAsset(episodeId, assetId, { name: normalizedTitle });
    return normalizedTitle;
  }
  throw new Error("cloud_asset_rename_unsupported");
}

export async function deleteCanvasCloudAsset(assetClient, entry, context = {}) {
  const assetId = requireAssetId(entry);
  if (entry.source === "team-library" && typeof assetClient?.deleteTeamAsset === "function") {
    await assetClient.deleteTeamAsset(assetId);
    return assetId;
  }
  if (entry.source === "project-library" && typeof assetClient?.deleteProjectAsset === "function") {
    await assetClient.deleteProjectAsset(assetId);
    return assetId;
  }
  const episodeId = String(context.episodeId ?? "").trim();
  if (entry.source === "episode-asset" && episodeId && typeof assetClient?.deleteEpisodeAsset === "function") {
    await assetClient.deleteEpisodeAsset(episodeId, assetId);
    return assetId;
  }
  throw new Error("cloud_asset_delete_unsupported");
}

export function renameCanvasCloudAssetEntry(entries = [], entryId, title) {
  return entries.map((entry) => entry.id === entryId ? { ...entry, title } : entry);
}

export function removeCanvasCloudAssetEntry(entries = [], entryId) {
  return entries.filter((entry) => entry.id !== entryId);
}
