import assert from "node:assert/strict";
import test from "node:test";

import {
  renderCanvasProjectGallery,
  renderCanvasSurfaceForHost,
} from "../src/features/production-workbench/project-detail.js";

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
  assert.match(html, /18 条\/页/);
  assert.match(html, /画布 19/);
  assert.match(html, /画布 20/);
  assert.match(html, /画布 21/);
  assert.match(html, /画布 22/);
  assert.doesNotMatch(html, /画布 01/);
});

test("canvas project gallery filters archived projects and exposes reversible archive actions", () => {
  const projects = [
    { id: "canvas-active", title: "活动画布", createdAt: "2026/07/25", status: "active" },
    { id: "canvas-archived", title: "归档画布", createdAt: "2026/07/24", status: "archived" },
  ];
  const activeHtml = renderCanvasProjectGallery({ canvasProjects: projects, canvasProjectStatusFilter: "active", canvasProjectMenuId: "canvas-active" });
  assert.match(activeHtml, /活动画布/);
  assert.doesNotMatch(activeHtml, /归档画布/);
  assert.match(activeHtml, /data-action="toggle-canvas-project-archive"[^>]*data-canvas-project-status="archived"/);

  const archivedHtml = renderCanvasProjectGallery({ canvasProjects: projects, canvasProjectStatusFilter: "archived", canvasProjectMenuId: "canvas-archived" });
  assert.match(archivedHtml, /归档画布/);
  assert.doesNotMatch(archivedHtml, /活动画布/);
  assert.match(archivedHtml, /data-action="toggle-canvas-project-archive"[^>]*data-canvas-project-status="active"/);
});

test("canvas project gallery searches titles and exposes an input bridge", () => {
  const html = renderCanvasProjectGallery({
    canvasProjects: [
      { id: "canvas-character", title: "角色探索", status: "active" },
      { id: "canvas-scene", title: "场景探索", status: "active" },
    ],
    canvasProjectSearchQuery: "角色",
  });
  assert.match(html, /data-canvas-project-search/);
  assert.match(html, /角色探索/);
  assert.doesNotMatch(html, /场景探索/);

  const emptyHtml = renderCanvasProjectGallery({
    canvasProjects: [{ id: "canvas-scene", title: "场景探索", status: "active" }],
    canvasProjectSearchQuery: "角色",
  });
  assert.match(emptyHtml, /没有匹配“角色”的画布/);
});

test("opened Canvas renders recent tabs and complete generation-history controls", () => {
  const html = renderCanvasSurfaceForHost({
    ui: {
      selectedCanvasProjectId: "canvas-b",
      canvasRecentProjectIds: ["canvas-b", "canvas-a"],
      canvasProjects: [
        { id: "canvas-a", title: "角色探索", status: "active" },
        { id: "canvas-b", title: "场景探索", status: "active" },
      ],
      canvasSidebarMode: "assets",
      canvasHistoryNextCursor: { createdAt: "2026-07-25T08:00:00.000Z", id: "run-1" },
      canvasDocument: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
      canvasAssets: [{ id: "artifact-1", runId: "run-1", type: "asset", kind: "image", title: "结果图", meta: "image", status: "可用" }],
    },
  });
  assert.match(html, /aria-label="最近打开的画布"/);
  assert.match(html, /角色探索/);
  assert.match(html, /场景探索/);
  assert.match(html, /data-action="export-canvas-generation-history"/);
  assert.match(html, /data-action="delete-canvas-node-generation-history"/);
  assert.match(html, /data-action="delete-all-canvas-generation-history"/);
  assert.match(html, /data-action="delete-canvas-generation-run" data-run-id="run-1"/);
  assert.match(html, /data-action="load-more-canvas-generation-history"/);
});
