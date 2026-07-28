import { type AnimationClip } from "three";
import { loadCharacterAssetFile, type CharacterAssetFormat } from "./characterAssetInspection";
import type { CharacterRigProfile } from "../schema/directorProject";

export interface CharacterAnimationInspection {
  format: CharacterAssetFormat;
  clips: Array<{ name: string; duration: number; trackCount: number }>;
  hasValidMotion: boolean;
  rigProfile: CharacterRigProfile;
  warnings: string[];
}

export function inspectCharacterAnimations(
  animations: AnimationClip[],
  format: CharacterAssetFormat = "fbx"
): CharacterAnimationInspection {
  const clips = animations.map((clip, index) => ({
    name: clip.name.trim() || `动作 ${index + 1}`,
    duration: Number(Math.max(0, clip.duration).toFixed(4)),
    trackCount: clip.tracks.length,
  }));
  const hasValidMotion = clips.some((clip) => clip.duration > 0.05 && clip.trackCount > 0);
  const trackNames = animations.flatMap((clip) => clip.tracks.map((track) => track.name.toLowerCase().replace(/[^a-z0-9]/g, "")));
  const rigProfile: CharacterRigProfile = trackNames.some((name) => name.includes("mixamorig1"))
    ? "mixamo-alt"
    : trackNames.some((name) => name.includes("mixamorig"))
      ? "mixamo"
      : trackNames.length ? "generic-humanoid" : "unknown";
  return {
    format,
    clips,
    hasValidMotion,
    rigProfile,
    warnings: hasValidMotion ? [] : ["未检测到可播放的动画 clip"],
  };
}

export async function inspectCharacterAnimationFile(file: File) {
  const loaded = await loadCharacterAssetFile(file);
  return inspectCharacterAnimations(loaded.animations, loaded.format);
}
