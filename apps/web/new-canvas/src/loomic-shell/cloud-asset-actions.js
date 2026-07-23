const MANAGED_SOURCES = new Set(["team-library"]);

function isTeamMember(actor) {
  return actor?.actorType === "team_member" || Boolean(actor?.teamMember?.id);
}

export function canvasCloudAssetCapabilities(entry, assetClient, actor) {
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
  return { canRename: false, canDelete: false };
}

function requireAssetId(entry) {
  const assetId = String(entry?.sourceId ?? "").trim();
  if (!assetId) throw new Error("cloud_asset_id_missing");
  return assetId;
}

export async function renameCanvasCloudAsset(assetClient, entry, title) {
  const assetId = requireAssetId(entry);
  const normalizedTitle = String(title ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  if (!normalizedTitle) throw new Error("cloud_asset_name_required");
  if (entry.source === "team-library" && typeof assetClient?.updateTeamAsset === "function") {
    await assetClient.updateTeamAsset(assetId, { name: normalizedTitle });
    return normalizedTitle;
  }
  throw new Error("cloud_asset_rename_unsupported");
}

export async function deleteCanvasCloudAsset(assetClient, entry) {
  const assetId = requireAssetId(entry);
  if (entry.source === "team-library" && typeof assetClient?.deleteTeamAsset === "function") {
    await assetClient.deleteTeamAsset(assetId);
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
