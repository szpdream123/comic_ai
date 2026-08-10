import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isProductionWebAssetPath,
  productionWebAssetCacheControl,
  renderProductionWebAppShell,
} from "../production-web-assets.ts";

const template = `<!doctype html>
<html>
  <head>
    <link rel="modulepreload" href="/src/features/production-workbench/index.js?version=1" />
  </head>
  <body>
    <script type="module" src="/app.js?version=1"></script>
  </body>
</html>`;

describe("production web assets", () => {
  it("rewrites the source module preload and entry script to the hashed production entry", () => {
    const entryUrl = "/.production/app-ABC12345.js";

    const rendered = renderProductionWebAppShell(template, entryUrl);

    assert.equal((rendered.match(new RegExp(entryUrl.replaceAll(".", "\\."), "g")) ?? []).length, 2);
    assert.doesNotMatch(rendered, /production-workbench\/index\.js|\/app\.js\?/);
  });

  it("leaves the development shell unchanged without a production entry", () => {
    assert.equal(renderProductionWebAppShell(template, undefined), template);
  });

  it("rejects entries outside the hashed production asset directory", () => {
    for (const entry of [
      "https://example.com/.production/app-ABC12345.js",
      "/app.js",
      "/.production/app.js",
      "/.production/../app-ABC12345.js",
    ]) {
      assert.throws(() => renderProductionWebAppShell(template, entry), /invalid_production_web_entry_url/);
    }
  });

  it("recognizes only hashed JavaScript files in the production asset directory", () => {
    assert.equal(isProductionWebAssetPath("/.production/app-ABC12345.js"), true);
    assert.equal(isProductionWebAssetPath("/.production/chunks/chunk-Z9Y8X7W6.js"), true);
    assert.equal(isProductionWebAssetPath("/.production/app.js"), false);
    assert.equal(isProductionWebAssetPath("/src/features/production-workbench/index.js"), false);
  });

  it("uses immutable caching only for hashed production assets", () => {
    assert.equal(
      productionWebAssetCacheControl("/.production/app-ABC12345.js"),
      "public, max-age=31536000, immutable",
    );
    assert.equal(
      productionWebAssetCacheControl("/app.js"),
      "public, max-age=0, must-revalidate",
    );
  });
});
