import assert from "node:assert/strict";
import { test } from "node:test";

import { renderProjectDetail } from "../src/features/production-workbench/project-detail.js";
import {
  renderAssetConversationEntryForPolling,
  renderEpisodeAssetCardForTest,
  renderStoryboardGenerationEntryForPolling,
} from "../src/features/production-workbench/episode-workbench-rebuilt.js";

test("episode asset and generation cards use the storage content gateway when object IDs exist", () => {
  const imageStorageObjectId = "11111111-2222-4333-8444-555555555555";
  const videoStorageObjectId = "66666666-7777-4888-8999-aaaaaaaaaaaa";
  const rawImageUrl = "https://bucket.cos.ap-guangzhou.myqcloud.com/legacy/image.png";
  const rawVideoUrl = "https://bucket.cos.ap-guangzhou.myqcloud.com/legacy/video.mp4";

  const assetHtml = renderEpisodeAssetCardForTest({
    id: "asset-1",
    name: "角色",
    storageObjectId: imageStorageObjectId,
    previewUrl: rawImageUrl,
  });
  const imageHtml = renderAssetConversationEntryForPolling({
    taskId: "task-1",
    fixedImages: [{
      label: "图片",
      storageObjectId: imageStorageObjectId,
      url: rawImageUrl,
    }],
  });
  const videoHtml = renderStoryboardGenerationEntryForPolling(
    { id: "storyboard-1" },
    {
      status: "succeeded",
      result: {
        storageObjectId: videoStorageObjectId,
        videoUrl: rawVideoUrl,
      },
    },
    "video",
  );

  assert.match(assetHtml, new RegExp(`/api/storage/objects/${imageStorageObjectId}/content\\?proxy=1`));
  assert.match(imageHtml, new RegExp(`/api/storage/objects/${imageStorageObjectId}/content\\?proxy=1`));
  assert.match(videoHtml, new RegExp(`/api/storage/objects/${videoStorageObjectId}/content\\?proxy=1`));
  assert.doesNotMatch(`${assetHtml}${imageHtml}${videoHtml}`, /myqcloud\.com/);
});

test("episode workbench hydrates same-name project library previews into asset tabs", () => {
  const html = renderProjectDetail({
    state: {
      project: { id: "project-1", name: "同名资产项目", phase: "asset_review", aspectRatio: "9:16" },
      projectDetail: {
        project: { id: "project-1", projectId: "project-1", name: "同名资产项目" },
        episodes: [{ id: "episode-1", title: "第一集", sequence: 1, status: "draft" }],
        shots: [],
        assetsByType: { character: [], scene: [], prop: [], other: { image: [], video: [] } },
      },
    },
    session: { user: { phone: "+86 13800138000" } },
    ui: {
      activeNavTab: "project",
      projectPanelMode: "episode-workbench",
      selectedEpisodeId: "episode-1",
      projectAssetTab: "character",
      museScopeMode: "assets",
      selectedEpisodeAssetId: "episode-character-hero",
      episodeWorkbenchContext: {
        assetsByType: {
          character: [
            {
              id: "episode-character-hero",
              name: "任小野",
              description: "剧集资产只有名称，图片来自项目资产库同名素材。",
            },
          ],
        },
      },
      projectLibraryAssetsByType: {
        character: [
          {
            id: "project-character-hero",
            label: "任小野",
            previewUrl: "/assets/generated/ren-xiaoye.png",
          },
        ],
      },
    },
  });

  assert.match(html, /<img src="\/assets\/generated\/ren-xiaoye\.png"/);
  assert.match(html, /任小野/);
});
