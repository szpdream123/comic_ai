import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  renderProductGeoArticleLinks,
  selectRelatedGeoArticles,
} from "../geo-related-links.ts";

function published(
  id: string,
  slug: string,
  topic: string,
  title: string,
  contentType: "guide" | "answer" = "guide",
) {
  return {
    item: {
      id,
      contentType,
      topic,
      slug,
      status: "published",
      currentPublishedVersionId: `version-${id}`,
    },
    version: {
      title,
      summary: `${title}摘要`,
      questionIds: [],
    },
  };
}

describe("GEO internal links", () => {
  it("prioritizes a mapped related article, then same-topic content, then the recent fallback", () => {
    const current = published(
      "current",
      "ai-character-consistency",
      "角色一致性",
      "人物一致性教程",
    );
    const recentFallback = published("recent", "recent-workflow", "制作流程", "最近发布的流程文章");
    const sameTopic = published("same-topic", "character-reference-sheet", "角色一致性", "角色参考表教程");
    const mappedAnswer = published(
      "mapped",
      "why-ai-short-drama-characters-inconsistent",
      "问题排查",
      "人物变样排查",
      "answer",
    );

    const selected = selectRelatedGeoArticles(
      current,
      [current, recentFallback, sameTopic, mappedAnswer],
      4,
    );

    assert.deepEqual(selected.map((entry) => entry.item.id), ["mapped", "same-topic", "recent"]);
  });

  it("excludes the current article and entries without a published version while filling from recent content", () => {
    const current = published("current", "ai-short-drama-asset-management", "素材管理", "素材管理教程");
    const relatedProject = published(
      "project",
      "multi-episode-ai-short-drama-project-management",
      "项目管理",
      "多集项目管理",
    );
    const draft = {
      ...published("draft", "draft-article", "素材管理", "草稿文章"),
      item: {
        ...published("draft", "draft-article", "素材管理", "草稿文章").item,
        status: "draft",
        currentPublishedVersionId: null,
      },
    };
    const recent = published("recent", "recent-article", "其他", "最近文章");

    const selected = selectRelatedGeoArticles(current, [current, draft, recent, relatedProject], 4);

    assert.deepEqual(selected.map((entry) => entry.item.id), ["project", "recent"]);
  });

  it("prioritizes articles linked to the same GEO question before topic and recent fallbacks", () => {
    const current = published("current", "current-article", "角色一致性", "当前文章");
    current.version.questionIds = ["question-1"];
    const recent = published("recent", "recent-article", "其他", "最近文章");
    const sameTopic = published("same-topic", "same-topic-article", "角色一致性", "同主题文章");
    const sharedQuestion = published("shared-question", "shared-question-article", "问题排查", "同问题文章");
    sharedQuestion.version.questionIds = ["question-1"];

    const selected = selectRelatedGeoArticles(current, [current, recent, sameTopic, sharedQuestion], 4);

    assert.deepEqual(selected.map((entry) => entry.item.id), ["shared-question", "same-topic", "recent"]);
  });

  it("renders two or three direct published-article hrefs for every public product page", () => {
    const expectedLinks: Record<string, string[]> = {
      "/": [
        "/answers/ai-short-drama-production-workflow",
        "/guides/novel-to-ai-short-drama-script",
        "/guides/ai-video-generation-iteration-workflow",
      ],
      "/script": [
        "/guides/novel-to-ai-short-drama-script",
        "/guides/ai-short-drama-dialogue-storyboard",
        "/answers/ai-storyboard-prompt-elements",
      ],
      "/canvas": [
        "/answers/text-first-frame-reference-video-generation",
        "/guides/ai-video-generation-iteration-workflow",
        "/guides/ai-short-drama-shot-continuity-check",
      ],
      "/projects": [
        "/guides/multi-episode-ai-short-drama-project-management",
        "/answers/ai-short-drama-production-workflow",
        "/guides/ai-storyboard-preproduction-checklist",
      ],
      "/assets": [
        "/guides/ai-short-drama-asset-management",
        "/guides/ai-character-consistency",
        "/answers/why-ai-short-drama-characters-inconsistent",
      ],
      "/team": [
        "/guides/ai-short-drama-team-collaboration",
        "/guides/multi-episode-ai-short-drama-project-management",
        "/guides/ai-short-drama-pilot-review-checklist",
      ],
    };

    for (const [path, hrefs] of Object.entries(expectedLinks)) {
      const html = renderProductGeoArticleLinks(path);
      assert.equal((html.match(/<a href=/g) ?? []).length, hrefs.length, path);
      for (const href of hrefs) {
        assert.match(html, new RegExp(`href="${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`), path);
      }
    }
  });
});
