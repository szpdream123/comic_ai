import { describe, expect, it } from "vitest";
import { CHARACTER_ACTION_PRESETS, sampleCharacterActionControls } from "./characterActionPresets";

describe("character action presets", () => {
  it("contains the recovered action presets", () => {
    expect(CHARACTER_ACTION_PRESETS.map((preset) => preset.id)).toEqual([
      "walk-cycle",
      "run-cycle",
      "crouch-cycle",
      "side-step-left",
      "jump-cycle",
      "wave-cycle",
      "dance-cycle",
    ]);
  });

  it("interpolates and loops keyframes by elapsed seconds", () => {
    expect(sampleCharacterActionControls("wave-cycle", 0.3)["rightHand.roll"]).toBeCloseTo(-10);
    expect(sampleCharacterActionControls("wave-cycle", 1.5)["rightHand.roll"]).toBeCloseTo(-10);
  });

  it("animates upper and lower body controls for dance", () => {
    const start = sampleCharacterActionControls("dance-cycle", 0);
    const beat = sampleCharacterActionControls("dance-cycle", 0.4);

    expect(beat["body.offsetY"]).not.toBe(start["body.offsetY"]);
    expect(beat["leftKnee.bend"]).not.toBe(start["leftKnee.bend"]);
    expect(beat["rightShoulder.spread"]).not.toBe(start["rightShoulder.spread"]);
  });
});
