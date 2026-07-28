import assert from "node:assert/strict";
import test from "node:test";

import {
  canvasGraphFitViewport,
  createCanvasMinimapController,
  renderCanvasMinimap,
} from "../src/features/new-canvas/canvas-minimap.js";

test("new Canvas minimap renders stable node bounds and selection", () => {
  const html = renderCanvasMinimap({
    selectedCanvasNodeId: "node-2",
    canvasDocument: {
      nodes: [
        { id: "node-1", position: { x: -100, y: 20 }, size: { width: 200, height: 100 }, data: { title: "一" } },
        { id: "node-2", position: { x: 500, y: 300 }, size: { width: 300, height: 180 }, data: { title: "二" } },
      ],
    },
  });
  assert.match(html, /data-canvas-minimap/);
  assert.match(html, /data-node-id="node-1"/);
  assert.match(html, /new-canvas-minimap-node selected[^>]*data-minimap-action="focus" data-node-id="node-2"/);
  for (const value of html.matchAll(/(?:left|top|width|height):([\d.]+)%/g)) {
    assert.equal(Number(value[1]) >= 0 && Number(value[1]) <= 100, true);
  }
});

test("new Canvas minimap computes a bounded fit for the active viewport", () => {
  const fit = canvasGraphFitViewport([
    { position: { x: 220, y: 180 }, size: { width: 360, height: 170 } },
    { position: { x: 256, y: 216 }, size: { width: 320, height: 170 } },
  ], { width: 416, height: 420 });
  assert.equal(fit.centerX, 400);
  assert.equal(fit.centerY, 283);
  assert.ok(Math.abs(fit.scale - 0.8888888888888888) < 1e-12);
  assert.ok(Math.abs(fit.translateX + 147.55555555555554) < 1e-12);
  assert.ok(Math.abs(fit.translateY + 41.55555555555556) < 1e-12);
});

test("new Canvas minimap focuses nodes, fits content, and releases graph listeners", () => {
  const calls = [];
  const listeners = [];
  const cell = { isNode: () => true };
  const graph = {
    on(name, handler) { listeners.push(["on", name, handler]); },
    off(name, handler) { listeners.push(["off", name, handler]); },
    centerPoint(x, y) { calls.push(["center", x, y]); },
    translate(x, y) { calls.push(["translate", x, y]); },
    getCellById(id) { calls.push(["cell", id]); return cell; },
    select(value) { calls.push(["select", value]); },
    zoomTo(value) { calls.push(["zoom", value]); },
    zoomToFit(options) { calls.push(["fit", options]); },
  };
  const workbench = {
    ui: {
      selectedCanvasNodeId: null,
      canvasDocument: { nodes: [{ id: "node-1", position: { x: 10, y: 20 }, size: { width: 280, height: 160 } }] },
    },
  };
  const controller = createCanvasMinimapController({
    surface: {
      querySelector(selector) {
        return selector === "[data-canvas-x6-mount]"
          ? { clientWidth: 416, clientHeight: 420, getBoundingClientRect: () => ({ width: 416, height: 420 }) }
          : null;
      },
    },
    workbench,
  });
  controller.bind(graph);
  assert.equal(controller.handleAction({ dataset: { minimapAction: "focus", nodeId: "node-1" } }), true);
  assert.deepEqual(calls[0], ["center", 150, 100]);
  assert.equal(workbench.ui.selectedCanvasNodeId, "node-1");
  assert.equal(controller.handleAction({ dataset: { minimapAction: "fit" } }), true);
  assert.equal(calls.some(([name]) => name === "zoom"), true);
  assert.equal(calls.some(([name]) => name === "translate"), true);
  controller.dispose();
  assert.equal(listeners.filter(([action]) => action === "on").length, 4);
  assert.equal(listeners.filter(([action]) => action === "off").length, 4);
});
