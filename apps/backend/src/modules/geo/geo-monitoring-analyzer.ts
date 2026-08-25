export type GeoMonitorResultStatus = "not_mentioned" | "mentioned" | "cited";

export interface GeoMonitorAnalysis {
  status: GeoMonitorResultStatus;
  brandMentioned: boolean;
  articleCited: boolean;
  citedUrls: string[];
}
export function analyzeGeoMonitorAnswer(input: {
  answer: string;
  citedUrls: string[];
  brandName: string;
  publishedHref: string;
}): GeoMonitorAnalysis {
  const citedUrls = uniqueUrls([
    ...input.citedUrls,
    ...extractHttpUrls(input.answer),
  ]);
  const brandMentioned = normalizeBrandText(input.answer).includes(normalizeBrandText(input.brandName));
  const publishedTarget = normalizedTarget(input.publishedHref);
  const articleCited = Boolean(publishedTarget.path) && citedUrls.some((url) => {
    const citedTarget = normalizedTarget(url);
    return citedTarget.path === publishedTarget.path
      && (!publishedTarget.origin || citedTarget.origin === publishedTarget.origin);
  });
  return {
    status: articleCited ? "cited" : brandMentioned ? "mentioned" : "not_mentioned",
    brandMentioned,
    articleCited,
    citedUrls,
  };
}

function normalizeBrandText(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase("zh-CN");
}

function extractHttpUrls(value: string) {
  return value.match(/https?:\/\/[^\s<>"'，。；、]+/giu)?.map(trimUrlPunctuation) ?? [];
}

function uniqueUrls(values: string[]) {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const url = trimUrlPunctuation(value.trim());
    if (!/^https?:\/\//iu.test(url) || seen.has(url)) return [];
    seen.add(url);
    return [url];
  });
}

function trimUrlPunctuation(value: string) {
  return value.replace(/[),.!?;:，。；：！？）]+$/u, "");
}

function normalizedTarget(value: string) {
  try {
    const url = new URL(value, "https://geo.local");
    return {
      origin: /^[a-z][a-z\d+.-]*:\/\//iu.test(value.trim()) ? url.origin : "",
      path: decodeURIComponent(url.pathname).replace(/\/+$/u, "") || "/",
    };
  } catch {
    return { origin: "", path: "" };
  }
}
