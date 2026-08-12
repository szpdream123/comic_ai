const productionWebAssetPathPattern = /^\/\.production\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+-[A-Z0-9]{8,}\.js$/;
const sourceWorkbenchPreloadPattern = /<link\s+rel="modulepreload"\s+href="\/src\/features\/production-workbench\/index\.js[^"]*"\s*\/>/;
const sourceAppScriptPattern = /<script\s+type="module"\s+src="\/app\.js[^"]*"><\/script>/;

export function isProductionWebAssetPath(pathname: string) {
  return !pathname.includes("/../")
    && !pathname.includes("/./")
    && productionWebAssetPathPattern.test(pathname);
}

export function productionWebAssetCacheControl(pathname: string) {
  return isProductionWebAssetPath(pathname)
    ? "public, max-age=31536000, immutable"
    : "public, max-age=0, must-revalidate";
}

export function renderProductionWebAppShell(template: string, entryUrl: string | undefined) {
  if (!entryUrl) return template;
  if (!isProductionWebAssetPath(entryUrl)) {
    throw new Error("invalid_production_web_entry_url");
  }
  if (!sourceWorkbenchPreloadPattern.test(template) || !sourceAppScriptPattern.test(template)) {
    throw new Error("production_web_app_shell_template_mismatch");
  }
  return template
    .replace(sourceWorkbenchPreloadPattern, `<link rel="modulepreload" href="${entryUrl}" />`)
    .replace(sourceAppScriptPattern, `<script type="module" src="${entryUrl}"></script>`);
}
