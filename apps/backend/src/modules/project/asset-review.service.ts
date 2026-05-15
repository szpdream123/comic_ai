export type AssetReviewGroup = "character" | "scene" | "prop";

export interface AssetCandidate {
  assetKey: string;
  label: string;
  required: boolean;
  confirmed: boolean;
}

export interface AssetReviewState {
  characters: AssetCandidate[];
  scenes: AssetCandidate[];
  props: AssetCandidate[];
}

export interface AssetReviewSummary {
  readyForGeneration: boolean;
  requiredBlockers: string[];
  warningBlockers: string[];
}

export function createAssetReviewState(input: {
  characters: Array<{ assetKey: string; label: string; required: boolean }>;
  scenes: Array<{ assetKey: string; label: string; required: boolean }>;
  props: Array<{ assetKey: string; label: string; required: boolean }>;
}): AssetReviewState {
  return {
    characters: input.characters.map(createCandidate),
    scenes: input.scenes.map(createCandidate),
    props: input.props.map(createCandidate),
  };
}

export function confirmAssetCandidate(
  state: AssetReviewState,
  input: {
    group: AssetReviewGroup;
    assetKey: string;
  },
): AssetReviewState {
  return updateCandidate(state, input.group, input.assetKey, (candidate) => ({
    ...candidate,
    confirmed: true,
  }));
}

export function updateAssetCandidateLabel(
  state: AssetReviewState,
  input: {
    group: AssetReviewGroup;
    assetKey: string;
    label: string;
  },
): AssetReviewState {
  return updateCandidate(state, input.group, input.assetKey, (candidate) => ({
    ...candidate,
    label: input.label.trim(),
  }));
}

export function computeAssetReviewSummary(state: AssetReviewState): AssetReviewSummary {
  const groups: Array<[AssetReviewGroup, AssetCandidate[]]> = [
    ["character", state.characters],
    ["scene", state.scenes],
    ["prop", state.props],
  ];

  const requiredBlockers: string[] = [];
  const warningBlockers: string[] = [];

  for (const [group, candidates] of groups) {
    for (const candidate of candidates) {
      if (candidate.confirmed) {
        continue;
      }

      const token = `${group}:${candidate.assetKey}`;
      if (candidate.required) {
        requiredBlockers.push(token);
      } else {
        warningBlockers.push(token);
      }
    }
  }

  return {
    readyForGeneration: requiredBlockers.length === 0,
    requiredBlockers,
    warningBlockers,
  };
}

function createCandidate(input: {
  assetKey: string;
  label: string;
  required: boolean;
}): AssetCandidate {
  return {
    assetKey: input.assetKey,
    label: input.label,
    required: input.required,
    confirmed: false,
  };
}

function updateCandidate(
  state: AssetReviewState,
  group: AssetReviewGroup,
  assetKey: string,
  updater: (candidate: AssetCandidate) => AssetCandidate,
): AssetReviewState {
  const key = getGroupKey(group);
  return {
    ...state,
    [key]: state[key].map((candidate) =>
      candidate.assetKey === assetKey ? updater(candidate) : candidate,
    ),
  };
}

function getGroupKey(group: AssetReviewGroup): keyof AssetReviewState {
  if (group === "character") {
    return "characters";
  }

  if (group === "scene") {
    return "scenes";
  }

  return "props";
}
