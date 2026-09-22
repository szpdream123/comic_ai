// Storage thumbnails, proxies and absolute/relative links identify the same file.
// Other URL query parameters may select different media and must remain intact.
export function normalizeReferenceMediaUrl(value) {
  const url = String(value ?? "").trim();
  const storagePath = /^(?:https?:\/\/[^/]+)?(\/api\/storage\/objects\/[^/?#]+\/content)\/?(?:[?#].*)?$/iu.exec(url);
  return storagePath ? storagePath[1] : url;
}
