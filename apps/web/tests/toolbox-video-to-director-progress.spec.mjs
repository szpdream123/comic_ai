import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  updateToolboxVideoToDirectorProgressForTest,
} from "../src/features/production-workbench/index.js";
import { renderToolboxPage } from "../src/features/toolbox/toolbox-page.js";

test("video to director progress updates only the existing button", () => {
  const video = { currentTime: 12.5 };
  const button = { textContent: "开始解析", disabled: false };
  const modal = {
    querySelector(selector) {
      return selector === "[data-toolbox-video-director-progress-button]" ? button : null;
    },
  };
  const root = {
    querySelector(selector) {
      if (selector === ".toolbox-director-modal") return modal;
      if (selector === "video") return video;
      return null;
    },
  };
  const workbench = {
    ui: { toolboxVideoToDirector: { status: "preparing", progress: 67 } },
    root,
  };

  assert.equal(updateToolboxVideoToDirectorProgressForTest(workbench), true);
  assert.equal(button.textContent, "正在解析 67%");
  assert.equal(button.disabled, true);
  assert.equal(root.querySelector("video"), video);
  assert.equal(video.currentTime, 12.5);
});

test("video to director progress clamps percentage and reports missing modal nodes", () => {
  const button = { textContent: "", disabled: false };
  const modal = { querySelector: () => button };
  const workbench = {
    ui: { toolboxVideoToDirector: { progress: 108 } },
    root: { querySelector: () => modal },
  };

  assert.equal(updateToolboxVideoToDirectorProgressForTest(workbench), true);
  assert.equal(button.textContent, "正在解析 99%");
  assert.equal(updateToolboxVideoToDirectorProgressForTest({
    ui: { toolboxVideoToDirector: { progress: 10 } },
    root: { querySelector: () => null },
  }), false);
});

test("video to director modal exposes a stable progress target", () => {
  const html = renderToolboxPage({
    toolboxVideoToDirector: {
      open: true,
      pluginStatus: "ready",
      selectedModelName: "vision-model",
      models: [{ displayName: "vision-model" }],
      file: {},
      fileName: "reference.mp4",
      previewUrl: "blob:reference",
    },
  });

  assert.match(html, /data-toolbox-video-director-progress-button/);
});

test("video to director caps high-resolution key frames without reducing timeline sheets", () => {
  const workbenchSource = readFileSync(
    new URL("../src/features/production-workbench/index.js", import.meta.url),
    "utf8",
  );
  const videoAnalysisSource = readFileSync(
    new URL("../src/features/toolbox/video-analysis-plugin-client.js", import.meta.url),
    "utf8",
  );

  assert.match(workbenchSource, /buildVideoModelFrameSheets\(browserAnalysisResult\.output, \{\s*maxKeyFrameCount: 12,/);
  assert.match(videoAnalysisSource, /Math\.min\(maxKeyFrameCount, MAX_MODEL_FRAME_SHEET_COUNT - timelineSheets\.length\)/);
  assert.match(videoAnalysisSource, /frameSheetDataUrls: \[\.\.\.timelineSheets, \.\.\.keyFrameSheets\]/);
});
