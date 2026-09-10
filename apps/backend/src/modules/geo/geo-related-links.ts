import type { GeoContentType } from "./geo-types.ts";

export interface GeoRelatedArticleEntry {
  item: {
    id: string;
    contentType: GeoContentType;
    topic: string;
    slug: string;
    status: string;
    currentPublishedVersionId: string | null;
  };
  version: {
    title: string;
    summary: string;
    questionIds: string[];
  };
}

const relatedSlugs: Record<string, string[]> = {
  "ai-character-consistency": ["why-ai-short-drama-characters-inconsistent"],
  "why-ai-short-drama-characters-inconsistent": ["ai-character-consistency"],
  "ai-storyboard-preproduction-checklist": ["ai-short-drama-dialogue-storyboard"],
  "ai-short-drama-dialogue-storyboard": ["ai-storyboard-preproduction-checklist", "ai-storyboard-prompt-elements"],
  "ai-short-drama-asset-management": ["multi-episode-ai-short-drama-project-management"],
  "multi-episode-ai-short-drama-project-management": ["ai-short-drama-asset-management"],
};

const productArticleLinks: Record<string, Array<{ href: string; title: string; summary: string }>> = {
  "/": [
    { href: "/answers/ai-short-drama-production-workflow", title: "AI短剧制作流程", summary: "从故事整理、分镜制作到成片检查，了解完整生产步骤。" },
    { href: "/guides/novel-to-ai-short-drama-script", title: "小说改AI短剧剧本", summary: "把文字故事整理成适合继续制作的剧本与分镜准备。" },
    { href: "/guides/ai-video-generation-iteration-workflow", title: "AI视频生成迭代流程", summary: "用提示词、首帧和参考素材继续调整生成结果。" },
  ],
  "/script": [
    { href: "/guides/novel-to-ai-short-drama-script", title: "小说改AI短剧剧本", summary: "从主线、人物和场景入手，把小说整理成可制作内容。" },
    { href: "/guides/ai-short-drama-dialogue-storyboard", title: "双人对白怎么拆分镜", summary: "围绕台词节拍、信息变化和人物反应组织镜头。" },
    { href: "/answers/ai-storyboard-prompt-elements", title: "分镜提示词应该包含什么", summary: "用主体、镜头和连续性信息写出可复用的分镜描述。" },
  ],
  "/canvas": [
    { href: "/answers/text-first-frame-reference-video-generation", title: "视频生成方式怎么选", summary: "根据镜头目标选择文生视频、首帧或参考素材生成。" },
    { href: "/guides/ai-video-generation-iteration-workflow", title: "生成结果怎么继续调整", summary: "保留输入和结果关系，逐步修改提示词与参考素材。" },
    { href: "/guides/ai-short-drama-shot-continuity-check", title: "镜头连续性检查方法", summary: "检查人物、空间、动作和光线在连续镜头中的衔接。" },
  ],
  "/projects": [
    { href: "/guides/multi-episode-ai-short-drama-project-management", title: "多集AI短剧项目管理", summary: "按项目、剧集和镜头组织连续短剧的制作资料。" },
    { href: "/answers/ai-short-drama-production-workflow", title: "AI短剧制作流程", summary: "明确从剧本、分镜到成片检查的各个制作阶段。" },
    { href: "/guides/ai-storyboard-preproduction-checklist", title: "分镜前期准备清单", summary: "进入分镜制作前先核对角色、场景和镜头信息。" },
  ],
  "/assets": [
    { href: "/guides/ai-short-drama-asset-management", title: "短剧素材库整理方法", summary: "分类管理角色、场景和道具，并在项目中持续复用。" },
    { href: "/guides/ai-character-consistency", title: "人物一致性实操方法", summary: "从角色设定、参考素材和分镜约束减少人物漂移。" },
    { href: "/answers/why-ai-short-drama-characters-inconsistent", title: "人物不一致原因排查", summary: "按脸型、发型、服装和镜头条件定位人物变样原因。" },
  ],
  "/team": [
    { href: "/guides/ai-short-drama-team-collaboration", title: "AI短剧团队怎么分工", summary: "围绕项目、剧集、素材和镜头安排团队协作。" },
    { href: "/guides/multi-episode-ai-short-drama-project-management", title: "多集AI短剧项目管理", summary: "让成员按统一的项目与剧集结构推进连续内容。" },
    { href: "/guides/ai-short-drama-pilot-review-checklist", title: "AI短剧样片验收清单", summary: "把剧情、画面、声音问题整理成可分派的返工任务。" },
  ],
};

export function selectRelatedGeoArticles<T extends GeoRelatedArticleEntry>(
  current: T,
  published: T[],
  limit: number,
) {
  const mapped = new Map((relatedSlugs[current.item.slug] ?? []).map((slug, index) => [slug, index]));
  const currentQuestions = new Set(current.version.questionIds);
  const normalizedTopic = current.item.topic.trim().toLocaleLowerCase();

  return published
    .map((entry, index) => ({
      entry,
      index,
      mappedIndex: mapped.get(entry.item.slug),
      sameTopic: Boolean(normalizedTopic) && entry.item.topic.trim().toLocaleLowerCase() === normalizedTopic,
      sharedQuestion: entry.version.questionIds.some((questionId) => currentQuestions.has(questionId)),
    }))
    .filter(({ entry }) => entry.item.id !== current.item.id
      && entry.item.status !== "archived"
      && Boolean(entry.item.currentPublishedVersionId))
    .sort((left, right) => {
      const leftScore = (left.mappedIndex === undefined ? 0 : 1_000 - left.mappedIndex)
        + (left.sharedQuestion ? 200 : 0)
        + (left.sameTopic ? 100 : 0);
      const rightScore = (right.mappedIndex === undefined ? 0 : 1_000 - right.mappedIndex)
        + (right.sharedQuestion ? 200 : 0)
        + (right.sameTopic ? 100 : 0);
      return rightScore - leftScore || left.index - right.index;
    })
    .slice(0, Math.max(0, limit))
    .map(({ entry }) => entry);
}

export function renderProductGeoArticleLinks(path: string) {
  return (productArticleLinks[path] ?? [])
    .map((link) => `<a href="${link.href}"><strong>${escapeHtml(link.title)}</strong><span>${escapeHtml(link.summary)}</span></a>`)
    .join("\n          ");
}

export function renderGeoTemplateLinks(path: string) {
  const resources = [
    { article: "/guides/ai-character-consistency", file: "character-consistency-checklist.csv", title: "角色一致性检查清单" },
    { article: "/guides/ai-short-drama-dialogue-storyboard", file: "dialogue-storyboard.csv", title: "对白分镜表" },
    { article: "/guides/ai-short-drama-asset-management", file: "asset-version-register.csv", title: "素材版本登记表" },
  ];
  const pathname = path.replace(/\/$/, "");
  const matches = resources.filter((resource) => resource.article === pathname || pathname === "/cases/cafe-dialogue-reference-workflow");
  if (matches.length === 0) return "";
  return `<aside class="geo-cta" aria-label="配套制作模板"><h2>配套制作模板</h2><p>下载 CSV 后可用 Excel 打开。示例行仅演示填写格式，请按自己的项目替换。</p><ul>${matches.map((resource) => `<li><a href="/geo-resources/${resource.file}" download>下载${resource.title}（CSV）</a></li>`).join("")}</ul><a href="/geo-resources/index.html">查看全部模板与填写说明</a></aside>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
