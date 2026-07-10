import assert from "node:assert/strict";
import test from "node:test";

import { renderCanvasProjectGallery } from "../src/features/production-workbench/project-detail.js";

test("canvas project gallery paginates cards with the shared gallery footer", () => {
  const html = renderCanvasProjectGallery({
    canvasProjectPage: 2,
    canvasProjects: Array.from({ length: 22 }, (_, index) => ({
      id: `canvas-project-${index + 1}`,
      title: `画布 ${String(index + 1).padStart(2, "0")}`,
      createdAt: "2026/06/10",
      status: "草稿",
    })),
    membershipStatus: { status: "active" },
  });

  assert.match(html, /class="project-gallery-pagination"/);
  assert.match(html, /data-action="change-canvas-project-page"/);
  assert.match(html, /class="project-gallery-page-button active"/);
  assert.match(html, /20 条\/页/);
  assert.match(html, /画布 21/);
  assert.match(html, /画布 22/);
  assert.doesNotMatch(html, /画布 01/);
});
