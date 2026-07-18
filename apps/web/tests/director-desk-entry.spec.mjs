import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { renderProjectDetail } from "../src/features/production-workbench/project-detail.js";
import {
  deriveInitialNavTabForTest,
  prepareDirectorDeskMountForRender,
  restoreDirectorDeskMountAfterRender,
  syncDirectorDeskMountTheme,
  syncWorkbenchRouteStateForTest,
} from "../src/features/production-workbench/index.js";

test("workbench rail exposes the director desk menu without adding a home hero action", () => {
  const html = renderProjectDetail({
    state: {},
    session: { user: { phone: "+86 13800138000" } },
    ui: { activeNavTab: "home" },
  });

  assert.match(html, /data-action="set-nav-tab"[\s\S]*data-tab="director"/);
  assert.match(html, /导演台/);
  assert.doesNotMatch(html, /hero-director-cta/);
});

test("director route keeps the workbench shell and renders a direct module mount", () => {
  const html = renderProjectDetail({
    state: {},
    session: { user: { phone: "+86 13800138000" } },
    ui: { activeNavTab: "director" },
  });

  assert.match(html, /class="production-workbench"/);
  assert.match(html, /class="workbench-main\s+director-mode"/);
  assert.match(html, /class="rail-item active"[\s\S]*data-tab="director"/);
  assert.match(html, /data-director-desk-mount/);
  assert.doesNotMatch(html, /director-desk-page-header/);
  assert.doesNotMatch(html, /<iframe/i);
});

test("director desk ships only as the Lingxi Theater integrated module", () => {
  const appSource = readFileSync("apps/web/src/features/director-desk/src/App.tsx", "utf8");
  const viteSource = readFileSync("apps/web/src/features/director-desk/vite.config.ts", "utf8");
  const workbenchSource = readFileSync("apps/web/src/features/production-workbench/index.js", "utf8");

  assert.equal(existsSync("apps/web/src/features/director-desk/index.html"), false);
  assert.equal(existsSync("apps/web/src/features/director-desk/src/main.tsx"), false);
  assert.doesNotMatch(appSource, /director-home-shell|screen === "home"/);
  assert.doesNotMatch(viteSource, /standaloneIndex|director-desk-standalone-index/);
  assert.match(workbenchSource, /DIRECTOR_DESK_MODULE_URL[\s\S]*?\?v=\$\{Date\.now\(\)\}/);
});

test("director hash is preserved as a workbench menu route", () => {
  const workbench = {
    session: { user: { phone: "+86 13800138000" } },
    ui: {
      activeNavTab: "home",
      projectPanelMode: "library",
      selectedEpisodeId: null,
      episodeWorkbenchContext: null,
    },
  };

  syncWorkbenchRouteStateForTest(workbench, "#director");

  assert.equal(workbench.ui.activeNavTab, "director");
  assert.equal(deriveInitialNavTabForTest("#director"), "director");
});

test("workbench rerenders preserve the live director desk mount and editor state", () => {
  const classNames = new Set(["dark"]);
  const mount = {
    isConnected: true,
    dataset: { theme: "dark" },
    classList: {
      toggle(name, active) {
        if (active) classNames.add(name);
        else classNames.delete(name);
      },
    },
    remove() {
      this.isConnected = false;
    },
  };
  let replacement = null;
  const placeholder = {
    replaceWith(node) {
      replacement = node;
      node.isConnected = true;
    },
  };
  const workbench = {
    directorDeskMount: mount,
    root: {
      querySelector(selector) {
        return selector === "[data-director-desk-mount]" ? placeholder : null;
      },
    },
    ui: { selectedWorkbenchTheme: "daylight" },
  };

  const preserved = prepareDirectorDeskMountForRender(workbench, true);
  assert.equal(preserved, mount);
  assert.equal(mount.isConnected, false);
  assert.equal(restoreDirectorDeskMountAfterRender(workbench, preserved), true);
  assert.equal(replacement, mount);
  assert.equal(workbench.directorDeskMount, mount);
  assert.equal(mount.dataset.theme, "light");
  assert.equal(classNames.has("dark"), false);

  workbench.ui.selectedWorkbenchTheme = "turquoise";
  syncDirectorDeskMountTheme(workbench);
  assert.equal(mount.dataset.theme, "dark");
  assert.equal(classNames.has("dark"), true);
});
