import assert from "node:assert/strict";
import test from "node:test";

import {
  renderEpisodeWorkbench,
  renderPromptAttachmentCard,
  renderStoryboardImageColumn,
} from "../src/features/production-workbench/episode-workbench-rebuilt.js";

const STORAGE_OBJECT_ID = "11111111-1111-4111-8111-111111111111";
const THUMBNAIL_URL = `/api/storage/objects/${STORAGE_OBJECT_ID}/content?thumbnail=1`;
const ORIGINAL_URL = `/api/storage/objects/${STORAGE_OBJECT_ID}/content?proxy=1`;

test("storyboard magnifier uses original storage content while the card keeps the thumbnail", () => {
  const html = renderStoryboardImageColumn({
    id: "storyboard-1",
    index: 1,
    title: "雨夜梧桐",
    currentImageAssetVersionId: "image-version-1",
    previewImageUrl: THUMBNAIL_URL,
    uploadedImages: [
      {
        id: "image-version-1",
        storageObjectId: STORAGE_OBJECT_ID,
        src: THUMBNAIL_URL,
        previewUrl: THUMBNAIL_URL,
      },
    ],
  });

  assert.match(html, new RegExp(`data-image-preview-url="${escapeRegExp(ORIGINAL_URL)}"`));
  assert.match(html, new RegExp(`<img src="${escapeRegExp(THUMBNAIL_URL)}"`));
});

test("storyboard magnifier resolves the selected storage object even when its source URL is absent", () => {
  const externalThumbnailUrl = "https://cdn.example.com/storyboards/thumbnail.jpg";
  const html = renderStoryboardImageColumn({
    id: "storyboard-2",
    index: 2,
    title: "机场晨光",
    currentImageAssetVersionId: "image-version-2",
    previewImageUrl: externalThumbnailUrl,
    uploadedImages: [
      {
        id: "image-version-2",
        storageObjectId: STORAGE_OBJECT_ID,
        previewUrl: externalThumbnailUrl,
      },
    ],
  });

  assert.match(html, new RegExp(`data-image-preview-url="${escapeRegExp(ORIGINAL_URL)}"`));
  assert.match(html, new RegExp(`<img src="${escapeRegExp(THUMBNAIL_URL)}"`));
});

test("storyboard magnifier does not reuse a stale storyboard storage object after switching images", () => {
  const selectedImageUrl = "https://cdn.example.com/storyboards/current-original.jpg";
  const html = renderStoryboardImageColumn({
    id: "storyboard-3",
    index: 3,
    title: "已切换图片",
    currentImageAssetVersionId: "image-version-b",
    currentImageStorageObjectId: STORAGE_OBJECT_ID,
    previewImageUrl: selectedImageUrl,
    uploadedImages: [
      {
        id: "image-version-b",
        src: selectedImageUrl,
        previewUrl: selectedImageUrl,
      },
    ],
  });

  assert.match(html, new RegExp(`data-image-preview-url="${escapeRegExp(selectedImageUrl)}"`));
  assert.match(html, new RegExp(`<img src="${escapeRegExp(selectedImageUrl)}"`));
  assert.doesNotMatch(html, new RegExp(`data-image-preview-url="${escapeRegExp(ORIGINAL_URL)}"`));
});

test("image attachment magnifier uses original storage content instead of its thumbnail", () => {
  const html = renderPromptAttachmentCard({
    id: "attachment-1",
    name: "故事板参考图",
    type: "image",
    storageObjectId: STORAGE_OBJECT_ID,
    previewUrl: THUMBNAIL_URL,
  }, 0, false);

  assert.match(html, new RegExp(`data-image-preview-url="${escapeRegExp(ORIGINAL_URL)}"`));
  assert.match(html, new RegExp(`<img src="${escapeRegExp(THUMBNAIL_URL)}"`));
});

test("quick reference magnifier uses original storage content while its card keeps the thumbnail", () => {
  const html = renderEpisodeWorkbench({
    assetLibrary: {
      character: [{ id: "asset-1", name: "角色一" }],
    },
    activeAssetTab: "character",
    selectedEpisodeAssetId: "asset-1",
    generationUiState: {
      museScopeMode: "assets",
      assetConversationHistory: {},
      assetPromptDraft: {
        quickReferenceItems: [{
          id: "quick-reference-1",
          name: "故事板快捷参考图",
          type: "image",
          storageObjectId: STORAGE_OBJECT_ID,
          previewUrl: THUMBNAIL_URL,
        }],
      },
    },
  });

  assert.match(html, new RegExp(`data-image-preview-url="${escapeRegExp(ORIGINAL_URL)}"`));
  assert.match(html, new RegExp(`<img src="${escapeRegExp(THUMBNAIL_URL)}"`));
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
