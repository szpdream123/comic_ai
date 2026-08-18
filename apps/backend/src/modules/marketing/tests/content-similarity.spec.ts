import assert from "node:assert/strict";
import { test } from "node:test";

import { findMarketingContentSimilarity } from "../domain/content-similarity.ts";

test("flags highly similar Chinese marketing copy without relying on a vector database", () => {
  const finding = findMarketingContentSimilarity({
    contentId: "new", platform: "douyin", contentType: "video",
    text: "三分钟了解原创漫画幕后制作流程和角色设计思路",
    assetStorageObjectIds: [],
    candidates: [{
      id: "existing", platform: "douyin", contentType: "video",
      text: "三分钟了解原创漫画幕后制作流程和角色设计思路！",
      assetStorageObjectIds: [],
    }],
  });
  assert.deepEqual(finding, { candidateId: "existing", kind: "text", score: 1, scope: "same_platform" });
});

test("flags repeated assets across platforms for manual copyright review", () => {
  const finding = findMarketingContentSimilarity({
    contentId: "new", platform: "douyin", contentType: "image", text: "不同的原创内容说明", assetStorageObjectIds: ["asset-1"],
    candidates: [{ id: "existing", platform: "xiaohongshu", contentType: "image", text: "另一段内容", assetStorageObjectIds: ["asset-1"] }],
  });
  assert.deepEqual(finding, { candidateId: "existing", kind: "asset", score: 1, scope: "cross_platform" });
});
