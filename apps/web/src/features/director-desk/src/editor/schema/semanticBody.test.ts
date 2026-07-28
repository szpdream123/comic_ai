import { expect, it } from "vitest";
import {
  DIRECTOR_CHARACTER_BONE_PARTS,
  getSemanticBodyPartForBoneName,
  isCompleteDirectorCharacterBoneMap,
} from "./semanticBody";

it("recognizes common humanoid bone names and requires every semantic body part", () => {
  expect(getSemanticBodyPartForBoneName("mixamorig:LeftForeArm")).toBe("leftElbow");
  expect(getSemanticBodyPartForBoneName("CC_Base_R_Thigh")).toBe("rightHip");
  const map = Object.fromEntries(DIRECTOR_CHARACTER_BONE_PARTS.map((part) => [part, `bone_${part}`]));
  expect(isCompleteDirectorCharacterBoneMap(map)).toBe(true);
  expect(isCompleteDirectorCharacterBoneMap({ ...map, head: "bone_body" })).toBe(false);
});
