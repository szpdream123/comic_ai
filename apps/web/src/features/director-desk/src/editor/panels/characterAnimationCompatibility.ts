import type { DirectorAnimationAssetRef, DirectorAssetRef } from "../schema/directorProject";
import { isCompleteDirectorCharacterBoneMap } from "../schema/semanticBody";

export function isCharacterAnimationCompatible(
  characterAsset: DirectorAssetRef | undefined,
  animationAsset: DirectorAnimationAssetRef
) {
  if (!characterAsset) return false;
  if (isCompleteDirectorCharacterBoneMap(characterAsset.characterBoneMap)) return true;
  const characterProfile = characterAsset.characterRigProfile;
  if (characterProfile === "mixamo" || characterProfile === "mixamo-alt") {
    return animationAsset.rigProfile === "mixamo" || animationAsset.rigProfile === "mixamo-alt";
  }
  return characterProfile !== "unknown" && characterProfile === animationAsset.rigProfile;
}
