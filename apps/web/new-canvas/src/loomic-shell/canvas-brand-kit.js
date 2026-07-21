const BRAND_ASSET_TYPES = new Set(["color", "font", "logo", "image"]);

const FONT_FAMILY_BY_CATEGORY = {
  monospace: 3,
  handwriting: 5,
  display: 6,
  serif: 2,
  "sans-serif": 2,
};

export const BRAND_KIT_CUSTOM_FONT_FAMILY = 4;
let activeBrandFontFaces = [];
let brandFontLoadVersion = 0;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function assetType(asset) {
  return text(asset?.asset_type ?? asset?.assetType).toLowerCase();
}

function assetText(asset) {
  return text(asset?.text_content ?? asset?.textContent);
}

function assetMetadata(asset) {
  const metadata = asset?.metadata;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
}

function assetStorageObjectId(asset) {
  return text(asset?.storage_object_id ?? asset?.storageObjectId);
}

function assetFileUrl(asset) {
  return text(asset?.file_url ?? asset?.fileUrl ?? asset?.signedUrl ?? asset?.url);
}

function storageObjectContentUrl(storageObjectId) {
  return storageObjectId ? `/api/storage/objects/${encodeURIComponent(storageObjectId)}/content` : "";
}

export function brandKitListFromPayload(payload) {
  const items = payload?.brandKits ?? payload?.brand_kits ?? payload?.items;
  return (Array.isArray(items) ? items : []).filter((kit) => text(kit?.id));
}

export function brandKitDetailFromPayload(payload) {
  const kit = payload?.brandKit ?? payload?.brand_kit ?? payload?.kit ?? payload;
  if (!kit || typeof kit !== "object" || !text(kit.id)) return null;
  return {
    ...kit,
    id: text(kit.id),
    name: text(kit.name) || "未命名",
    is_default: Boolean(kit.is_default ?? kit.isDefault),
    guidance_text: text(kit.guidance_text ?? kit.guidanceText) || null,
    assets: (Array.isArray(kit.assets) ? kit.assets : [])
      .filter((asset) => text(asset?.id) && BRAND_ASSET_TYPES.has(assetType(asset)))
      .sort((left, right) => Number(left.sort_order ?? left.sortOrder ?? 0) - Number(right.sort_order ?? right.sortOrder ?? 0)),
  };
}

export function selectedBrandKitIdFromPayload(payload) {
  return text(
    payload?.brandKitId
      ?? payload?.brand_kit_id
      ?? payload?.project?.brandKitId
      ?? payload?.project?.brand_kit_id,
  );
}

export function brandKitAssetsByType(kit, type) {
  return (Array.isArray(kit?.assets) ? kit.assets : []).filter((asset) => assetType(asset) === type);
}

export function brandKitPrimaryColor(kit) {
  const colors = brandKitAssetsByType(kit, "color");
  const preferred = colors.find((asset) => ["primary", "text"].includes(text(asset.role).toLowerCase())) ?? colors[0];
  const color = assetText(preferred);
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "";
}

export function brandKitCanvasBackground(kit) {
  const color = assetText(brandKitAssetsByType(kit, "color").find((asset) => text(asset.role).toLowerCase() === "background"));
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "";
}

export function brandKitCanvasFont(kit) {
  const fonts = brandKitAssetsByType(kit, "font");
  const preferred = fonts.find((asset) => ["primary", "heading", "body"].includes(text(asset.role).toLowerCase())) ?? fonts[0];
  if (!preferred) return null;
  const metadata = assetMetadata(preferred);
  const category = text(metadata.category).toLowerCase();
  const assetId = text(preferred.id);
  const family = assetText(preferred) || text(preferred.display_name ?? preferred.displayName);
  const storageObjectId = assetStorageObjectId(preferred);
  const sourceUrl = storageObjectContentUrl(storageObjectId) || assetFileUrl(preferred);
  const custom = Boolean(assetId && family && sourceUrl);
  return {
    assetId,
    family,
    canvasFontFamily: custom ? BRAND_KIT_CUSTOM_FONT_FAMILY : FONT_FAMILY_BY_CATEGORY[category] ?? 2,
    fallbackCanvasFontFamily: FONT_FAMILY_BY_CATEGORY[category] ?? 2,
    custom,
    sourceUrl,
    runtimeFamily: custom ? `Loomic Custom ${assetId}` : "",
  };
}

function removeActiveBrandKitCanvasFont(runtime = {}) {
  const fontFamilies = runtime.fontFamilies;
  const documentFonts = runtime.documentFonts;
  if (documentFonts?.delete) activeBrandFontFaces.forEach((fontFace) => documentFonts.delete(fontFace));
  activeBrandFontFaces = [];
  if (!fontFamilies) return false;
  let changed = false;
  for (const [family, id] of Object.entries(fontFamilies)) {
    if (id !== BRAND_KIT_CUSTOM_FONT_FAMILY) continue;
    delete fontFamilies[family];
    changed = true;
  }
  return changed;
}

export function clearBrandKitCanvasFont(runtime = {}) {
  brandFontLoadVersion += 1;
  return removeActiveBrandKitCanvasFont(runtime);
}

export async function registerBrandKitCanvasFont(kit, runtime = {}) {
  const font = brandKitCanvasFont(kit);
  const fontFamilies = runtime.fontFamilies;
  const documentFonts = runtime.documentFonts;
  const FontFaceCtor = runtime.FontFaceCtor;
  if (!font?.custom || !font.runtimeFamily || !font.sourceUrl || !fontFamilies || typeof FontFaceCtor !== "function" || !documentFonts?.add) {
    clearBrandKitCanvasFont(runtime);
    return false;
  }
  const loadVersion = brandFontLoadVersion + 1;
  brandFontLoadVersion = loadVersion;
  const loaded = await new FontFaceCtor(font.runtimeFamily, `url(${JSON.stringify(font.sourceUrl)})`).load();
  if (loadVersion !== brandFontLoadVersion) return false;
  removeActiveBrandKitCanvasFont(runtime);
  fontFamilies[font.runtimeFamily] = BRAND_KIT_CUSTOM_FONT_FAMILY;
  documentFonts.add(loaded);
  activeBrandFontFaces = [loaded];
  return true;
}

export function buildBrandKitGenerationGuidance(kit) {
  const detail = brandKitDetailFromPayload(kit);
  if (!detail) return "";
  const colors = brandKitAssetsByType(detail, "color")
    .map((asset) => `${text(asset.display_name ?? asset.displayName) || "颜色"}${text(asset.role) ? `(${text(asset.role)})` : ""}: ${assetText(asset)}`)
    .filter((value) => /#[0-9a-f]{6}/i.test(value));
  const fonts = brandKitAssetsByType(detail, "font")
    .map((asset) => `${text(asset.display_name ?? asset.displayName) || "字体"}: ${assetText(asset)}`)
    .filter((value) => !value.endsWith(": "));
  const logos = brandKitAssetsByType(detail, "logo")
    .map((asset) => text(asset.display_name ?? asset.displayName))
    .filter(Boolean);
  const images = brandKitAssetsByType(detail, "image")
    .map((asset) => text(asset.display_name ?? asset.displayName))
    .filter(Boolean);
  const lines = [
    `品牌套件：${detail.name}`,
    detail.guidance_text ? `品牌指南：${detail.guidance_text}` : "",
    colors.length ? `品牌色：${colors.join("；")}` : "",
    fonts.length ? `品牌字体：${fonts.join("；")}` : "",
    logos.length ? `品牌标志：${logos.join("、")}` : "",
    images.length ? `品牌参考图：${images.join("、")}` : "",
  ].filter(Boolean);
  return lines.length > 1 ? lines.join("\n") : "";
}

export function applyBrandKitToGenerationRequest(request, kit) {
  if (!["image-generator", "video-generator", "director-node"].includes(text(request?.type))) return request;
  const guidance = buildBrandKitGenerationGuidance(kit);
  const detail = brandKitDetailFromPayload(kit);
  if (!guidance || !detail || !request || typeof request !== "object") return request;
  const marker = `品牌套件：${detail.name}`;
  const promptField = ["prompt", "instructions", "text"].find((field) => text(request[field])) ?? "prompt";
  const current = text(request[promptField]);
  const nextPrompt = current.includes(marker) ? current : `${current}${current ? "\n\n" : ""}${guidance}`;
  return {
    ...request,
    [promptField]: nextPrompt,
    brandKitId: detail.id,
    brandKitContext: {
      id: detail.id,
      name: detail.name,
      assetReferences: detail.assets.map((asset) => ({
        id: text(asset.id),
        type: assetType(asset),
        name: text(asset.display_name ?? asset.displayName),
        role: text(asset.role) || null,
        storageObjectId: text(asset.storage_object_id ?? asset.storageObjectId) || null,
      })),
    },
  };
}

export function applyBrandKitToCanvasSelection(api, kit) {
  if (!api || !kit) return false;
  const color = brandKitPrimaryColor(kit);
  const font = brandKitCanvasFont(kit);
  const selectedIds = api.getAppState?.().selectedElementIds ?? {};
  let changed = false;
  const elements = (api.getSceneElements?.() ?? []).map((element) => {
    if (!selectedIds[element.id] || element.isDeleted) return element;
    const updates = {};
    if (color && ["text", "rectangle", "ellipse", "diamond", "arrow", "line", "freedraw"].includes(element.type)) updates.strokeColor = color;
    if (font && element.type === "text") updates.fontFamily = font.canvasFontFamily;
    if (!Object.keys(updates).length) return element;
    changed = true;
    return {
      ...element,
      ...updates,
      customData: {
        ...(element.customData ?? {}),
        brandKitId: text(kit.id),
        ...(font ? { brandFontAssetId: font.assetId, brandFontFamily: font.family } : {}),
      },
      version: Number(element.version ?? 1) + 1,
      versionNonce: Math.floor(Math.random() * 2_000_000_000),
      updated: Date.now(),
    };
  });
  if (changed) api.updateScene?.({ elements, captureUpdate: "IMMEDIATELY" });
  return changed;
}

export function applyBrandKitBackground(api, kit) {
  const background = brandKitCanvasBackground(kit);
  if (!api || !background) return false;
  api.updateScene?.({ appState: { viewBackgroundColor: background }, captureUpdate: "IMMEDIATELY" });
  return true;
}

export function brandKitTextNodeOptions(kit) {
  const font = brandKitCanvasFont(kit);
  return {
    strokeColor: brandKitPrimaryColor(kit) || undefined,
    fontFamily: font?.canvasFontFamily,
    customData: kit?.id ? {
      brandKitId: text(kit.id),
      ...(font ? { brandFontAssetId: font.assetId, brandFontFamily: font.family } : {}),
    } : undefined,
  };
}
