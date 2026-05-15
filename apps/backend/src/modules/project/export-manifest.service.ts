export interface ExportManifestItem {
  shotId: string;
  title: string;
  imageAssetVersionId: string;
}

export interface ExportManifestMissingAsset {
  shotId: string;
  title: string;
  missing: "current_image_asset";
}

export interface ExportManifest {
  projectId: string;
  status: "ready" | "partial";
  allowPartialExport: boolean;
  items: ExportManifestItem[];
  missingAssets: ExportManifestMissingAsset[];
}

export class ExportManifestBlockedError extends Error {
  constructor(readonly missingAssets: ExportManifestMissingAsset[]) {
    super("export_manifest_blocked");
  }
}

export function buildExportManifest(input: {
  projectId: string;
  allowPartialExport?: boolean;
  shots: Array<{
    shotId: string;
    title: string;
    currentImageAssetVersionId: string | null;
  }>;
}): ExportManifest {
  const items: ExportManifestItem[] = [];
  const missingAssets: ExportManifestMissingAsset[] = [];

  for (const shot of input.shots) {
    if (shot.currentImageAssetVersionId) {
      items.push({
        shotId: shot.shotId,
        title: shot.title,
        imageAssetVersionId: shot.currentImageAssetVersionId,
      });
      continue;
    }

    missingAssets.push({
      shotId: shot.shotId,
      title: shot.title,
      missing: "current_image_asset",
    });
  }

  const allowPartialExport = input.allowPartialExport === true;
  if (missingAssets.length > 0 && !allowPartialExport) {
    throw new ExportManifestBlockedError(missingAssets);
  }

  return {
    projectId: input.projectId,
    status: missingAssets.length > 0 ? "partial" : "ready",
    allowPartialExport,
    items,
    missingAssets,
  };
}
