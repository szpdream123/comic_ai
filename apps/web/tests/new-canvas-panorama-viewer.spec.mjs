import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createCanvasPanoramaViewerController,
  panoramaCameraDirection,
} from "../src/features/new-canvas/canvas-panorama-viewer.js";

test("Three.js panorama camera direction follows persisted yaw and pitch", () => {
  const front = panoramaCameraDirection({ yaw: 0, pitch: 0, fov: 95 });
  assert.ok(Math.abs(front.x - 1) < 0.000001);
  assert.ok(Math.abs(front.y) < 0.000001);
  assert.ok(Math.abs(front.z) < 0.000001);
  const up = panoramaCameraDirection({ yaw: 0, pitch: 85, fov: 95 });
  assert.ok(up.y > 0.99);
});

test("Three.js panorama controller releases renderer, texture, material, geometry, and context", async () => {
  const calls = [];
  const classNames = new Set();
  const canvas = { toBlob(callback) { callback({ type: "image/png" }); } };
  const root = {
    dataset: { nodeId: "pano-1", panoramaUrl: "/pano.jpg", panoramaYaw: "180", panoramaPitch: "0", panoramaFov: "95" },
    isConnected: true,
    clientWidth: 420,
    clientHeight: 220,
    classList: {
      add(value) { classNames.add(value); },
      remove(value) { classNames.delete(value); },
      contains(value) { return classNames.has(value); },
    },
    querySelector: () => canvas,
    getBoundingClientRect: () => ({ width: 420, height: 220 }),
  };
  const surface = { querySelectorAll: () => [root] };
  class WebGLRenderer {
    constructor() { this.renderLists = { dispose: () => calls.push("renderLists") }; }
    setPixelRatio() {}
    setSize() {}
    render() { calls.push("render"); }
    dispose() { calls.push("renderer"); }
    forceContextLoss() { calls.push("context"); }
  }
  class Scene { add() {} }
  class PerspectiveCamera {
    updateProjectionMatrix() {}
    lookAt() {}
  }
  class SphereGeometry {
    scale() {}
    dispose() { calls.push("geometry"); }
  }
  class MeshBasicMaterial {
    dispose() { calls.push("material"); }
  }
  class TextureLoader {
    setCrossOrigin() {}
    load(_url, onLoad) { onLoad({ dispose: () => calls.push("texture") }); }
  }
  const THREE = {
    WebGLRenderer,
    Scene,
    PerspectiveCamera,
    SphereGeometry,
    MeshBasicMaterial,
    TextureLoader,
    Mesh: class {},
    Color: class {},
    SRGBColorSpace: "srgb",
  };
  const controller = createCanvasPanoramaViewerController({ surface, loadThree: async () => THREE });
  assert.equal(await controller.bind(), true);
  assert.equal(classNames.has("is-three-ready"), true);
  assert.deepEqual(await controller.capture("pano-1"), { type: "image/png" });
  root.isConnected = false;
  assert.equal(await controller.capture("pano-1"), null);
  controller.dispose();
  assert.ok(calls.includes("texture"));
  assert.ok(calls.includes("material"));
  assert.ok(calls.includes("geometry"));
  assert.ok(calls.includes("renderer"));
  assert.ok(calls.includes("context"));
});
