import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { __marketingCompetitorCollectionTestUtils } from "../workers/marketing-competitor-collection.worker.ts";

describe("marketing competitor collection", () => {
  it("keeps only bounded public content fields before research analysis", () => {
    const records = __marketingCompetitorCollectionTestUtils.compactCrawlerRecords([{
      aweme_id: "video-1",
      title: "AI 工具实测",
      desc: "用一分钟展示实际流程",
      cookie: "must-not-be-stored",
      author: { phone: "13800000000", nickname: "creator" },
      comments: Array.from({ length: 30 }, (_, index) => ({ content: `评论 ${index}` })),
    }], 1);

    assert.deepEqual(Object.keys(records[0]!).sort(), ["aweme_id", "comments", "desc", "title"]);
    assert.equal((records[0]!.comments as unknown[]).length, 20);
    assert.doesNotMatch(JSON.stringify(records), /cookie|13800000000/);
  });

  it("derives reusable patterns without retaining competitor copy in the fallback prompt package", () => {
    const profile = __marketingCompetitorCollectionTestUtils.buildResearchProfile([{
      title: "竞品独有标题文案",
      desc: "竞品独有描述文案",
      liked_count: 100,
      comment_count: 30,
      share_count: 10,
      collect_count: 12,
    }], "AI 视频");
    const promptPackage = __marketingCompetitorCollectionTestUtils.fallbackPromptPackage(profile);

    assert.equal(profile.sampledContentCount, 1);
    assert.ok(Array.isArray(profile.recurringTopicTerms));
    assert.equal(promptPackage.storyboard.length, 3);
    assert.equal(promptPackage.videoPrompts.length, 3);
    assert.doesNotMatch(JSON.stringify(promptPackage), /竞品独有标题文案|竞品独有描述文案/);
  });

  it("selects only crawler exports created by the active run", () => {
    const selected = __marketingCompetitorCollectionTestUtils.newestCrawlerFile([
      { path: "dy/old.json", modified_at: 1_700_000_000, type: "json" },
      { path: "dy/search_contents_new.json", modified_at: 1_800_000_010, type: "json" },
      { path: "dy/search_comments_new.json", modified_at: 1_800_000_020, type: "json" },
    ], new Date(1_800_000_000_000));

    assert.equal(selected?.path, "dy/search_contents_new.json");
  });

  it("uses the MediaCrawler douyin data directory when listing exports", () => {
    assert.equal(__marketingCompetitorCollectionTestUtils.crawlerDataPlatform, "douyin");
  });

  it("uses the full comment export as aggregate research signals without retaining comments", () => {
    const comments = __marketingCompetitorCollectionTestUtils.crawlerCommentTexts([
      { content: "想看全集，下一集什么时候更新？" },
      { content: "求教程，怎么制作？" },
    ]);
    const profile = __marketingCompetitorCollectionTestUtils.buildResearchProfile([{ title: "AI 漫剧" }], "AI 漫剧", comments);

    assert.equal(profile.commentSignals.sampledCommentCount, 2);
    assert.equal(profile.commentSignals.questionCount, 2);
    assert.equal(profile.commentSignals.requestOrExpectationCount, 2);
    assert.doesNotMatch(JSON.stringify(profile), /下一集什么时候更新/);
  });
});
