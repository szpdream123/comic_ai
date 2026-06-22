import assert from "node:assert/strict";
import { test } from "node:test";

import { mapEpisodeStoryboardContractForTest } from "../src/features/production-workbench/index.js";

test("prefers the locally hydrated dynamic video prompt when a later storyboard reload only returns backend summary text", () => {
  const localStoryboard = mapEpisodeStoryboardContractForTest({
    id: "shot-1",
    linkedShotId: "shot-1",
    indexNo: 1,
    description: "【分镜1】\n【镜头列表】\n【镜头1】0-3秒 中景固定镜头，任小野递出饭食。",
    sceneAnalysis: "任小野递出饭食",
    plotPreview: "麻烦您了",
    chapterVideoPrompt: "【分镜1】\n【镜头列表】\n【镜头1】0-3秒 中景固定镜头，任小野递出饭食。",
    videoPrompt: "【分镜1】\n【镜头列表】\n【镜头1】0-3秒 中景固定镜头，任小野递出饭食。",
    chapterImagePrompt: "静态图片提示词",
    imagePrompt: "静态图片提示词",
    generationDrafts: [
      {
        mode: "video",
        prompt: "【分镜1】\n【镜头列表】\n【镜头1】0-3秒 中景固定镜头，任小野递出饭食。",
        payload: { source: "commit_hydrate" },
        updatedAt: null,
      },
    ],
  });

  const reloadedStoryboard = mapEpisodeStoryboardContractForTest({
    id: "shot-1",
    linkedShotId: "shot-1",
    indexNo: 1,
    description: "后端摘要",
    sceneAnalysis: "",
    plotPreview: "",
    generationDrafts: localStoryboard.generationDrafts,
    chapterVideoPrompt: localStoryboard.chapterVideoPrompt,
    videoPrompt: localStoryboard.videoPrompt,
  });

  assert.equal(
    reloadedStoryboard.description,
    "【分镜1】\n【镜头列表】\n【镜头1】0-3秒 中景固定镜头，任小野递出饭食。",
  );
  assert.equal(
    reloadedStoryboard.generationState.videoPrompt,
    "【分镜1】\n【镜头列表】\n【镜头1】0-3秒 中景固定镜头，任小野递出饭食。",
  );
});
