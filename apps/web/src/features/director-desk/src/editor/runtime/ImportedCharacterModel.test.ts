import { AnimationClip, Object3D, QuaternionKeyframeTrack } from "three";
import { expect, it } from "vitest";
import { retargetImportedCharacterAnimation } from "./ImportedCharacterModel";

it("redirects an external animation track through the saved manual bone mapping", () => {
  const target = new Object3D();
  const head = new Object3D();
  head.name = "custom_head";
  target.add(head);
  const clip = new AnimationClip("Look", 1, [
    new QuaternionKeyframeTrack("mixamorig:Head.quaternion", [0, 1], [0, 0, 0, 1, 0, 0.2, 0, 0.98]),
  ]);

  const retargeted = retargetImportedCharacterAnimation(clip, target, { head: "custom_head" });

  expect(retargeted.tracks[0]?.name).toBe("custom_head.quaternion");
  expect(clip.tracks[0]?.name).toBe("mixamorig:Head.quaternion");
});
