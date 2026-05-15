import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  confirmAssetCandidate,
  createAssetReviewState,
  computeAssetReviewSummary,
  updateAssetCandidateLabel,
} from "../asset-review.service.ts";

describe("asset review service", () => {
  it("blocks readiness until required character and scene assets are confirmed", async () => {
    const state = createAssetReviewState({
      characters: [
        { assetKey: "hero-main", label: "Hero", required: true },
        { assetKey: "mentor-main", label: "Mentor", required: true },
      ],
      scenes: [{ assetKey: "forest-night", label: "Forest", required: true }],
      props: [{ assetKey: "sword-01", label: "Sword", required: false }],
    });

    const initial = computeAssetReviewSummary(state);
    assert.equal(initial.readyForGeneration, false);
    assert.deepEqual(initial.requiredBlockers, [
      "character:hero-main",
      "character:mentor-main",
      "scene:forest-night",
    ]);
    assert.deepEqual(initial.warningBlockers, ["prop:sword-01"]);
  });

  it("marks required blockers resolved after confirmation and keeps optional props as warnings only", async () => {
    let state = createAssetReviewState({
      characters: [{ assetKey: "hero-main", label: "Hero", required: true }],
      scenes: [{ assetKey: "forest-night", label: "Forest", required: true }],
      props: [{ assetKey: "sword-01", label: "Sword", required: false }],
    });

    state = confirmAssetCandidate(state, {
      group: "character",
      assetKey: "hero-main",
    });
    state = confirmAssetCandidate(state, {
      group: "scene",
      assetKey: "forest-night",
    });

    const summary = computeAssetReviewSummary(state);
    assert.equal(summary.readyForGeneration, true);
    assert.deepEqual(summary.requiredBlockers, []);
    assert.deepEqual(summary.warningBlockers, ["prop:sword-01"]);
  });

  it("supports editing candidate labels without changing confirmation state", async () => {
    let state = createAssetReviewState({
      characters: [{ assetKey: "hero-main", label: "Unnamed", required: true }],
      scenes: [],
      props: [],
    });

    state = confirmAssetCandidate(state, {
      group: "character",
      assetKey: "hero-main",
    });
    state = updateAssetCandidateLabel(state, {
      group: "character",
      assetKey: "hero-main",
      label: "Hero Prime",
    });

    assert.equal(state.characters[0]?.label, "Hero Prime");
    assert.equal(state.characters[0]?.confirmed, true);
  });
});
