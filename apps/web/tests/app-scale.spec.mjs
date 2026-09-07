import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appHtmlUrl = new URL("../app.html", import.meta.url);
const appScaleCssUrl = new URL("../app-scale.css", import.meta.url);

test("desktop workbench renders at the requested 75 percent scale", async () => {
  const [html, css] = await Promise.all([
    readFile(appHtmlUrl, "utf8"),
    readFile(appScaleCssUrl, "utf8"),
  ]);

  assert.match(html, /<link rel="stylesheet" href="\/app-scale\.css" \/>/);
  assert.match(
    html,
    /<style id="critical-workbench-paint">[\s\S]*?html,[\s\S]*?background:\s*#07080d[\s\S]*?body\.workbench-body,[\s\S]*?#creator-app[\s\S]*?body\.public-seo-session-pending \.public-seo-content[\s\S]*?display:\s*none\s*!important/s,
  );
  assert.match(css, /--app-ui-scale:\s*0\.75/);
  assert.match(css, /@media \(min-width:\s*769px\)/);
  assert.match(css, /body\.workbench-body\s*\{[\s\S]*?zoom:\s*var\(--app-ui-scale\)/);
  assert.match(css, /height:\s*calc\(100dvh \/ var\(--app-ui-scale\)\)/);
  assert.match(css, /\.ai-canvas-standalone-page[\s\S]*?\.ai-canvas-standalone-mount[\s\S]*?height:\s*calc\(100dvh \/ var\(--app-ui-scale\)\)/);
  assert.match(css, /\.ai-canvas-standalone-page[\s\S]*?\.ai-canvas-standalone-mount[\s\S]*?min-height:\s*calc\(100dvh \/ var\(--app-ui-scale\)\)/);
  assert.match(css, /\.initial-workbench-shell[\s\S]*?height:\s*calc\(100dvh \/ var\(--app-ui-scale\)/);
  assert.match(css, /\.initial-workbench-shell[\s\S]*?min-height:\s*calc\(100dvh \/ var\(--app-ui-scale\)/);
  assert.match(css, /\.ai-canvas-standalone-mount\s*>\s*\[data-new-canvas-light-dom-root\][\s\S]*?height:\s*100%/);
  assert.match(css, /\[data-new-canvas-light-dom-root\]\s*>\s*\.new-canvas-root[\s\S]*?min-height:\s*100%/);
  assert.match(css, /\[data-new-canvas-light-dom-root\]\s*>\s*\[data-new-canvas-style-gate\][\s\S]*?height:\s*100%/);
  assert.match(css, /\.ai-canvas-standalone-mount \.new-canvas-loading-skeleton[\s\S]*?min-height:\s*100%/);
  assert.match(
    css,
    /body\.workbench-body\.public-seo-page\s*\{[^}]*min-height:\s*calc\(100dvh \/ var\(--app-ui-scale\)\)/s,
  );
  assert.match(
    css,
    /body\.workbench-body\.public-seo-page \.creator-app\s*\{[^}]*height:\s*calc\(100dvh \/ var\(--app-ui-scale\)\)[^}]*min-height:\s*calc\(100dvh \/ var\(--app-ui-scale\)\)/s,
  );
});
