import { Box3, type AnimationClip, type Object3D, type SkinnedMesh } from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  getSemanticBodyPartForBoneName,
  type DirectorCharacterBoneMap,
} from "../schema/semanticBody";

export type CharacterAssetFormat = "fbx" | "glb";
export type CharacterImportReadiness = "ready" | "manual-mapping" | "static-only";

export interface CharacterAssetInspection {
  format: CharacterAssetFormat;
  readiness: CharacterImportReadiness;
  boneNames: string[];
  boneMap: DirectorCharacterBoneMap;
  animationNames: string[];
  animationCount: number;
  skinnedMeshCount: number;
  warnings: string[];
}

export interface LoadedCharacterAsset {
  format: CharacterAssetFormat;
  scene: Object3D;
  animations: AnimationClip[];
}

const CHARACTER_EXTENSION_RE = /\.(fbx|glb)$/i;

function getFormat(fileName: string): CharacterAssetFormat {
  const format = fileName.match(CHARACTER_EXTENSION_RE)?.[1]?.toLowerCase();
  if (format === "fbx" || format === "glb") return format;
  throw new Error("角色模型仅支持 FBX / GLB 文件");
}

function parseGlb(buffer: ArrayBuffer) {
  return new Promise<GLTF>((resolve, reject) => new GLTFLoader().parse(buffer, "", resolve, reject));
}

export async function loadCharacterAssetFile(file: File): Promise<LoadedCharacterAsset> {
  const format = getFormat(file.name);
  const buffer = await file.arrayBuffer();
  try {
    if (format === "fbx") {
      const scene = new FBXLoader().parse(buffer, "");
      return { format, scene, animations: scene.animations ?? [] };
    }
    const gltf = await parseGlb(buffer);
    return { format, scene: gltf.scene, animations: gltf.animations ?? [] };
  } catch (error) {
    throw new Error(`角色模型读取失败：${error instanceof Error ? error.message : "文件内容无法解析"}`);
  }
}

export function inspectCharacterAsset(
  scene: Object3D,
  animations: AnimationClip[] = [],
  format: CharacterAssetFormat = "fbx"
): CharacterAssetInspection {
  const meshes: SkinnedMesh[] = [];
  scene.traverse((node) => {
    if ("isSkinnedMesh" in node && node.isSkinnedMesh === true) meshes.push(node as SkinnedMesh);
  });
  const primaryMesh = meshes.reduce<SkinnedMesh | null>(
    (current, mesh) => !current || mesh.skeleton.bones.length > current.skeleton.bones.length ? mesh : current,
    null
  );
  const boneNames = primaryMesh?.skeleton.bones.map((bone) => bone.name) ?? [];
  const boneMap = Object.fromEntries(
    boneNames.flatMap((boneName) => {
      const part = getSemanticBodyPartForBoneName(boneName);
      return part ? [[part, boneName]] : [];
    })
  ) as DirectorCharacterBoneMap;
  let bounds = new Box3();
  try {
    bounds = new Box3().setFromObject(scene);
  } catch {
    // Keep skeleton diagnostics available when malformed skin weights prevent bounds calculation.
  }
  const warnings: string[] = [];
  if (!meshes.length) warnings.push("没有检测到蒙皮骨架，只能作为静态模型使用");
  if (bounds.isEmpty()) warnings.push("无法计算模型尺寸");
  const mappedCount = Object.keys(boneMap).length;
  if (meshes.length && mappedCount < 15) warnings.push("身体部位识别不完整，请完成手动骨骼映射后导入动作");
  if (!animations.length) warnings.push("模型没有自带动作，可单独导入 FBX / GLB 动作文件");
  return {
    format,
    readiness: meshes.length === 0 ? "static-only" : mappedCount === 15 ? "ready" : "manual-mapping",
    boneNames,
    boneMap,
    animationNames: animations.map((clip, index) => clip.name.trim() || `动作 ${index + 1}`),
    animationCount: animations.length,
    skinnedMeshCount: meshes.length,
    warnings,
  };
}

export async function inspectCharacterAssetFile(file: File) {
  const loaded = await loadCharacterAssetFile(file);
  return inspectCharacterAsset(loaded.scene, loaded.animations, loaded.format);
}
