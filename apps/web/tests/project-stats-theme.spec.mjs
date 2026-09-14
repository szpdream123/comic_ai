import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const css = readFileSync(
  new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
  "utf8",
);

function firstRuleBody(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]*)\\}`))?.groups?.body ?? "";
}

describe("project stats dashboard theme propagation", () => {
  it("uses the selected workbench theme instead of a hardcoded dark teal palette", () => {
    const dashboard = firstRuleBody(".project-stats-dashboard");
    const hero = firstRuleBody(".project-stats-hero");
    const statCard = firstRuleBody(".project-stats-hero .project-info-card.stat-card");
    const ringHole = firstRuleBody(".project-stats-ring::before");
    const delivery = firstRuleBody(".project-stats-delivery");
    const stageIcon = firstRuleBody(".project-production-stage-icon");

    assert.match(dashboard, /--stats-ink:\s*rgb\(var\(--director-text-rgb\)\)/);
    assert.match(dashboard, /--stats-muted:\s*rgb\(var\(--director-text-muted-rgb\)\)/);
    assert.match(dashboard, /--stats-line:\s*var\(--theme-control-border\)/);
    assert.match(dashboard, /--stats-cyan:\s*var\(--theme-accent-icon\)/);
    assert.match(dashboard, /var\(--theme-panel-background\)/);
    assert.doesNotMatch(dashboard, /#0d1518/);
    assert.doesNotMatch(dashboard, /#64e6d3/);
    assert.doesNotMatch(dashboard, /#f2f7f6/);

    assert.match(hero, /var\(--theme-panel-background-soft\)/);
    assert.match(statCard, /background:\s*var\(--theme-surface-background\)/);
    assert.match(ringHole, /background:\s*var\(--theme-panel-background\)/);
    assert.match(delivery, /background:\s*var\(--theme-surface-background\)/);
    assert.match(stageIcon, /background:\s*var\(--theme-control-background\)/);
  });
});
