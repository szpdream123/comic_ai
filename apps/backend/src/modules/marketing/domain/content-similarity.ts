export type MarketingContentSimilarityCandidate = {
  id: string;
  platform: string;
  contentType: "image" | "video";
  text: string;
  assetStorageObjectIds: string[];
};

export type MarketingContentSimilarityFinding = {
  candidateId: string;
  kind: "text" | "asset";
  score: number;
  scope: "same_platform" | "cross_platform";
};

const minimumComparableLength = 16;

export function findMarketingContentSimilarity(input: {
  contentId: string;
  platform: string;
  contentType: "image" | "video";
  text: string;
  assetStorageObjectIds: string[];
  candidates: MarketingContentSimilarityCandidate[];
}): MarketingContentSimilarityFinding | null {
  const currentText = normalizeText(input.text);
  const currentAssets = new Set(input.assetStorageObjectIds.filter(Boolean));
  let highest: MarketingContentSimilarityFinding | null = null;

  for (const candidate of input.candidates) {
    if (!candidate.id || candidate.id === input.contentId) continue;
    const scope = candidate.platform === input.platform ? "same_platform" : "cross_platform";
    const sharedAssetCount = candidate.contentType === input.contentType
      ? candidate.assetStorageObjectIds.filter((id) => currentAssets.has(id)).length
      : 0;
    if (sharedAssetCount > 0) {
      highest = selectHigher(highest, {
        candidateId: candidate.id,
        kind: "asset",
        score: 1,
        scope,
      });
    }

    const candidateText = normalizeText(candidate.text);
    if (currentText.length < minimumComparableLength || candidateText.length < minimumComparableLength) continue;
    const score = diceCoefficient(characterBigrams(currentText), characterBigrams(candidateText));
    if (score >= 0.68) {
      highest = selectHigher(highest, { candidateId: candidate.id, kind: "text", score, scope });
    }
  }
  return highest;
}

function normalizeText(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/\s+/g, "")
    .replace(/[\p{P}\p{S}]/gu, "");
}

function characterBigrams(value: string) {
  const result = new Map<string, number>();
  for (let index = 0; index < value.length - 1; index += 1) {
    const bigram = value.slice(index, index + 2);
    result.set(bigram, (result.get(bigram) ?? 0) + 1);
  }
  return result;
}

function diceCoefficient(left: Map<string, number>, right: Map<string, number>) {
  const leftCount = [...left.values()].reduce((total, count) => total + count, 0);
  const rightCount = [...right.values()].reduce((total, count) => total + count, 0);
  if (!leftCount || !rightCount) return 0;
  let intersection = 0;
  for (const [key, count] of left) intersection += Math.min(count, right.get(key) ?? 0);
  return (2 * intersection) / (leftCount + rightCount);
}

function selectHigher(
  existing: MarketingContentSimilarityFinding | null,
  candidate: MarketingContentSimilarityFinding,
) {
  if (!existing || candidate.score > existing.score) return candidate;
  if (candidate.score === existing.score && candidate.candidateId.localeCompare(existing.candidateId) < 0) return candidate;
  return existing;
}
