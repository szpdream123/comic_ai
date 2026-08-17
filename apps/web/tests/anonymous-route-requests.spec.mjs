import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { initProductionWorkbench } from "../src/features/production-workbench/index.js";

const ANONYMOUS_ROUTES = ["home", "tools", "project", "script", "team", "director"];

test("anonymous main routes only request public home recommendations", async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousLocalStorage = globalThis.localStorage;
  const previousSessionStorage = globalThis.sessionStorage;

  try {
    for (const route of ANONYMOUS_ROUTES) {
      const calls = [];
      const root = {
        innerHTML: "",
        addEventListener() {},
        querySelector() { return null; },
        querySelectorAll() { return []; },
      };
      globalThis.window = {
        location: {
          protocol: "http:",
          host: "127.0.0.1:4310",
          origin: "http://127.0.0.1:4310",
          pathname: `/${route === "home" ? "" : route}`,
          hash: `#${route}`,
        },
        addEventListener() {},
      };
      globalThis.document = {
        visibilityState: "visible",
        body: { classList: { toggle() {} } },
        addEventListener() {},
        removeEventListener() {},
      };
      globalThis.localStorage = createMemoryStorage();
      globalThis.sessionStorage = createMemoryStorage();

      const api = new Proxy({}, {
        get(_target, property) {
          return async () => {
            calls.push(String(property));
            return {};
          };
        },
      });

      await initProductionWorkbench({
        root,
        session: { authenticated: false, user: { id: "", phone: "" } },
        api,
        onLogout() {},
      });

      assert.deepEqual(
        calls,
        route === "home" ? ["getHomeRecommendations"] : [],
        `${route} requested unexpected page data`,
      );
      if (route === "director") {
        assert.match(root.innerHTML, /data-director-desk-mount/);
      }
    }
  } finally {
    restoreGlobal("window", previousWindow);
    restoreGlobal("document", previousDocument);
    restoreGlobal("localStorage", previousLocalStorage);
    restoreGlobal("sessionStorage", previousSessionStorage);
  }
});

test("anonymous API policy permits home recommendations", () => {
  const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  assert.match(appSource, /ANONYMOUS_READ_API_METHODS[\s\S]*?"getHomeRecommendations"/);
});

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(String(key)) ?? null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
  };
}

function restoreGlobal(name, value) {
  if (value === undefined) {
    delete globalThis[name];
  } else {
    globalThis[name] = value;
  }
}
