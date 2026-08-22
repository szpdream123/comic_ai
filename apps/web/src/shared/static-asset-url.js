const STATIC_ASSET_ORIGIN = "https://static.lingxiyunai.com";

export function resolveStaticAssetUrl(value) {
  const text = String(value ?? "");
  const location = typeof window !== "undefined" ? window.location : null;
  const productionSite = location?.protocol === "https:"
    && /(?:^|\.)lingxiyunai\.com$/i.test(location.hostname ?? "");
  return productionSite && text.startsWith("/assets/")
    ? `${STATIC_ASSET_ORIGIN}${text}`
    : text;
}
