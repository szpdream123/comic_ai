import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const css = readFileSync(
  new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
  "utf8",
);

function lastRuleBody(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...css.matchAll(new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]*)\\}`, "g"))]
    .at(-1)?.groups?.body ?? "";
}

describe("project asset library theme propagation", () => {
  it("uses the selected theme for asset tabs and action cards", () => {
    const activeTab = lastRuleBody(
      ".workbench-body .asset-library-tab.active .asset-library-tab-icon",
    );
    const generateCard = lastRuleBody(".workbench-body .asset-generate-card");
    const importCard = lastRuleBody(".workbench-body .asset-import-card");
    const generateHover = lastRuleBody(".workbench-body .asset-generate-card:focus-visible");
    const importHover = lastRuleBody(".workbench-body .asset-import-card:focus-visible");

    assert.match(activeTab, /color:\s*var\(--theme-accent-icon\)/);
    assert.match(generateCard, /border:\s*1px solid var\(--theme-control-active-border\)/);
    assert.match(generateCard, /background:\s*var\(--theme-control-active-background\)/);
    assert.match(importCard, /border:\s*1px solid var\(--theme-control-border\)/);
    assert.match(importCard, /background:\s*var\(--theme-control-background\)/);
    assert.match(generateHover, /background:\s*var\(--theme-accent-gradient\)/);
    assert.match(importHover, /background:\s*var\(--theme-control-hover-background\)/);
  });
});
