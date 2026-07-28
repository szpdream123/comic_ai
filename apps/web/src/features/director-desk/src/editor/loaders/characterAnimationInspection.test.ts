import { AnimationClip, NumberKeyframeTrack } from "three";
import { expect, it } from "vitest";
import { inspectCharacterAnimations } from "./characterAnimationInspection";

it("reports playable Mixamo animation clips", () => {
  const report = inspectCharacterAnimations([
    new AnimationClip("Walk", 1.2, [new NumberKeyframeTrack("mixamorig:Hips.position[x]", [0, 1.2], [0, 1])]),
  ]);
  expect(report.hasValidMotion).toBe(true);
  expect(report.rigProfile).toBe("mixamo");
  expect(report.clips).toEqual([{ name: "Walk", duration: 1.2, trackCount: 1 }]);
});
