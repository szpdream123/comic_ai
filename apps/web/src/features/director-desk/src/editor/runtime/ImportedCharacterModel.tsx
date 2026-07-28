import { useLoader } from "@react-three/fiber";
import { useLayoutEffect, useMemo } from "react";
import { AnimationMixer, Box3, LoopRepeat, Vector3, type AnimationClip, type Object3D } from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { CharacterRigState, DirectorModelFormat } from "../schema/directorProject";
import { getSemanticBodyPartForBoneName, type DirectorCharacterBoneMap } from "../schema/semanticBody";
import { VIEWPORT_OBJECT_LABEL_VERTICAL_GAP } from "../schema/viewportLabels";

export interface ImportedCharacterAnimation {
  url: string;
  format: Extract<DirectorModelFormat, "fbx" | "glb">;
  clipName: string;
}

type ImportedCharacterModelProps = {
  url: string;
  format: Extract<DirectorModelFormat, "fbx" | "glb">;
  boneMap?: DirectorCharacterBoneMap;
  externalAnimation?: ImportedCharacterAnimation | null;
  animationTimeSeconds?: number;
  rigState?: CharacterRigState;
  onLabelAnchorYChange?: (anchorY: number) => void;
};

function normalizeBoneName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^mixamorig1/, "mixamorig");
}

export function retargetImportedCharacterAnimation(
  sourceClip: AnimationClip,
  target: Object3D,
  boneMap: DirectorCharacterBoneMap = {}
) {
  const targetByNormalizedName = new Map<string, Object3D>();
  target.traverse((node) => {
    const normalized = normalizeBoneName(node.name);
    if (normalized && !targetByNormalizedName.has(normalized)) targetByNormalizedName.set(normalized, node);
  });
  const clip = sourceClip.clone();
  clip.tracks.forEach((track) => {
    const separator = track.name.lastIndexOf(".");
    if (separator < 1) return;
    const sourceBoneName = track.name.slice(0, separator);
    const semanticPart = getSemanticBodyPartForBoneName(sourceBoneName);
    const targetBoneName = semanticPart ? boneMap[semanticPart] : undefined;
    const targetNode = (targetBoneName ? target.getObjectByName(targetBoneName) : null)
      ?? target.getObjectByName(sourceBoneName)
      ?? targetByNormalizedName.get(normalizeBoneName(sourceBoneName));
    if (targetNode && targetNode.name !== sourceBoneName) {
      track.name = `${targetNode.name}${track.name.slice(separator)}`;
    }
  });
  return clip;
}

function AnimationPlayer({ animationTimeSeconds = 0, clip, scene }: {
  animationTimeSeconds?: number;
  clip: AnimationClip;
  scene: Object3D;
}) {
  const mixer = useMemo(() => new AnimationMixer(scene), [scene]);

  useLayoutEffect(() => {
    const action = mixer.clipAction(clip, scene);
    action.reset().setLoop(LoopRepeat, Infinity).play();
    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(scene);
    };
  }, [clip, mixer, scene]);

  useLayoutEffect(() => {
    mixer.setTime(clip.duration > 0 ? animationTimeSeconds % clip.duration : 0);
    scene.updateMatrixWorld(true);
  }, [animationTimeSeconds, clip.duration, mixer, scene]);

  return null;
}

function PreparedAnimation({ animation, boneMap, scene, animationTimeSeconds }: {
  animation: ImportedCharacterAnimation;
  boneMap?: DirectorCharacterBoneMap;
  scene: Object3D;
  animationTimeSeconds?: number;
}) {
  return animation.format === "glb"
    ? <GlbAnimation animation={animation} boneMap={boneMap} scene={scene} animationTimeSeconds={animationTimeSeconds} />
    : <FbxAnimation animation={animation} boneMap={boneMap} scene={scene} animationTimeSeconds={animationTimeSeconds} />;
}

function FbxAnimation(props: Parameters<typeof PreparedAnimation>[0]) {
  const loaded = useLoader(FBXLoader, props.animation.url);
  const sourceClip = loaded.animations.find((clip) => clip.name === props.animation.clipName) ?? loaded.animations[0];
  const clip = useMemo(
    () => sourceClip ? retargetImportedCharacterAnimation(sourceClip, props.scene, props.boneMap) : null,
    [props.boneMap, props.scene, sourceClip]
  );
  return clip ? <AnimationPlayer animationTimeSeconds={props.animationTimeSeconds} clip={clip} scene={props.scene} /> : null;
}

function GlbAnimation(props: Parameters<typeof PreparedAnimation>[0]) {
  const loaded = useLoader(GLTFLoader, props.animation.url);
  const sourceClip = loaded.animations.find((clip) => clip.name === props.animation.clipName) ?? loaded.animations[0];
  const clip = useMemo(
    () => sourceClip ? retargetImportedCharacterAnimation(sourceClip, props.scene, props.boneMap) : null,
    [props.boneMap, props.scene, sourceClip]
  );
  return clip ? <AnimationPlayer animationTimeSeconds={props.animationTimeSeconds} clip={clip} scene={props.scene} /> : null;
}

function LoadedCharacter({ source, ...props }: Omit<ImportedCharacterModelProps, "url" | "format"> & { source: Object3D }) {
  const { scene, offset, scale } = useMemo(() => {
    const clone = cloneSkeleton(source) as Object3D;
    clone.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(clone);
    const size = bounds.getSize(new Vector3());
    const nextScale = size.y > 0 ? 1.8 / size.y : 1;
    return {
      scene: clone,
      offset: new Vector3(
        -(bounds.min.x + bounds.max.x) * 0.5 * nextScale,
        -bounds.min.y * nextScale,
        -(bounds.min.z + bounds.max.z) * 0.5 * nextScale
      ),
      scale: nextScale,
    };
  }, [source]);

  useLayoutEffect(() => {
    props.onLabelAnchorYChange?.(1.8 + VIEWPORT_OBJECT_LABEL_VERTICAL_GAP + (props.rigState?.controls["body.offsetY"] ?? 0));
  }, [props.onLabelAnchorYChange, props.rigState?.controls, scene]);

  return (
    <group name="imported-character" position={[offset.x, offset.y, offset.z]} scale={scale}>
      <primitive object={scene} />
      {props.externalAnimation ? (
        <PreparedAnimation
          animation={props.externalAnimation}
          animationTimeSeconds={props.animationTimeSeconds}
          boneMap={props.boneMap}
          scene={scene}
        />
      ) : null}
    </group>
  );
}

function FbxCharacter(props: ImportedCharacterModelProps) {
  const source = useLoader(FBXLoader, props.url);
  return <LoadedCharacter {...props} source={source} />;
}

function GlbCharacter(props: ImportedCharacterModelProps) {
  const source = useLoader(GLTFLoader, props.url);
  return <LoadedCharacter {...props} source={source.scene} />;
}

export function ImportedCharacterModel(props: ImportedCharacterModelProps) {
  return props.format === "glb" ? <GlbCharacter {...props} /> : <FbxCharacter {...props} />;
}
