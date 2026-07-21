import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { canHandleCanvasMediaInput } from "../new-canvas/src/loomic-shell/canvas-media-input.js";

const image = { name: "frame.png", type: "image/png" };
const video = { name: "shot.mp4", type: "video/mp4" };

function pasteEvent(target = { tagName: "DIV" }) {
  return { target, clipboardData: { files: [image] } };
}

function fileDropEvent(target = { tagName: "DIV" }) {
  return { target, dataTransfer: { types: ["Files"], files: [image, video] } };
}

test("workflow mode keeps image paste and file drag/drop enabled", () => {
  assert.equal(canHandleCanvasMediaInput(pasteEvent(), { viewMode: "workflow", kind: "paste" }), true);
  assert.equal(canHandleCanvasMediaInput(fileDropEvent(), { viewMode: "workflow", kind: "drag" }), true);
  assert.equal(canHandleCanvasMediaInput(fileDropEvent(), { viewMode: "workflow", kind: "drop" }), true);
});

test("storyboard mode rejects image paste and file drag/drop", () => {
  assert.equal(canHandleCanvasMediaInput(pasteEvent(), { viewMode: "storyboard", kind: "paste" }), false);
  assert.equal(canHandleCanvasMediaInput(fileDropEvent(), { viewMode: "storyboard", kind: "drag" }), false);
  assert.equal(canHandleCanvasMediaInput(fileDropEvent(), { viewMode: "storyboard", kind: "drop" }), false);
});

test("typing targets never redirect paste or file drop to the canvas", () => {
  for (const target of [
    { tagName: "INPUT" },
    { tagName: "TEXTAREA" },
    { tagName: "SELECT" },
    { tagName: "DIV", isContentEditable: true },
    { tagName: "SPAN", closest: (selector) => selector.includes("role='textbox'") ? {} : null },
  ]) {
    assert.equal(canHandleCanvasMediaInput(pasteEvent(target), { viewMode: "workflow", kind: "paste" }), false);
    assert.equal(canHandleCanvasMediaInput(fileDropEvent(target), { viewMode: "workflow", kind: "drop" }), false);
  }
});

test("non-image paste and non-file drag remain untouched", () => {
  assert.equal(canHandleCanvasMediaInput({ target: {}, clipboardData: { files: [video] } }, { viewMode: "workflow", kind: "paste" }), false);
  assert.equal(canHandleCanvasMediaInput({ target: {}, dataTransfer: { types: ["text/plain"] } }, { viewMode: "workflow", kind: "drop" }), false);
});

test("canvas shell uses the shared guard and never renders the drop overlay in storyboard mode", async () => {
  const shell = await readFile(new URL("../new-canvas/src/loomic-shell/LoomicCanvasShell.jsx", import.meta.url), "utf8");
  assert.match(shell, /canHandleCanvasMediaInput\(event, \{ viewMode, kind: "paste" \}\)/);
  assert.match(shell, /canHandleCanvasMediaInput\(event, \{ viewMode, kind: "drag" \}\)/);
  assert.match(shell, /canHandleCanvasMediaInput\(event, \{ viewMode, kind: "drop" \}\)/);
  assert.match(shell, /if \(viewMode !== "workflow"\) setDropActive\(false\)/);
  assert.match(shell, /viewMode === "workflow" && dropActive \? <div className="lm-canvas-drop-overlay"/);
});
