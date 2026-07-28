import { Component, type ReactNode } from "react";
import type { CharacterRigState } from "../schema/directorProject";
import { PrimitiveMannequin } from "./PrimitiveMannequin";
import { UE4MannequinModel } from "./UE4MannequinModel";
import type { CharacterBodyType } from "./mannequin/bodyTypes";
import { MixamoCharacterModel } from "./MixamoCharacterModel";
import { ImportedCharacterModel, type ImportedCharacterAnimation } from "./ImportedCharacterModel";
import type { DirectorModelFormat } from "../schema/directorProject";
import type { DirectorCharacterBoneMap } from "../schema/semanticBody";

interface CharacterModelProps {
  bodyType?: CharacterBodyType;
  color?: string;
  onLabelAnchorYChange?: (anchorY: number) => void;
  rigState?: CharacterRigState;
  /** Signals that the parent has applied an automatic locomotion pose. */
  motionWalking?: boolean;
  assetUrl?: string;
  assetFormat?: DirectorModelFormat;
  boneMap?: DirectorCharacterBoneMap;
  externalAnimation?: ImportedCharacterAnimation | null;
  animationTimeSeconds?: number;
}

class CharacterModelBoundary extends Component<
  {
    fallback: ReactNode;
    children: ReactNode;
  },
  {
    hasError: boolean;
  }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

export function CharacterModel({
  assetUrl,
  assetFormat,
  boneMap,
  bodyType,
  color,
  externalAnimation,
  animationTimeSeconds,
  onLabelAnchorYChange,
  rigState,
}: CharacterModelProps) {
  const fallback = <PrimitiveMannequin bodyType={bodyType} color={color} rigState={rigState} />;

  if (assetUrl && rigState?.rigType === "mixamo") {
    if (assetFormat === "glb" || externalAnimation) {
      return (
        <CharacterModelBoundary fallback={fallback}>
          <ImportedCharacterModel
            animationTimeSeconds={animationTimeSeconds}
            boneMap={boneMap}
            externalAnimation={externalAnimation}
            format={assetFormat === "glb" ? "glb" : "fbx"}
            onLabelAnchorYChange={onLabelAnchorYChange}
            rigState={rigState}
            url={assetUrl}
          />
        </CharacterModelBoundary>
      );
    }
    return (
      <CharacterModelBoundary fallback={fallback}>
        <MixamoCharacterModel url={assetUrl} onLabelAnchorYChange={onLabelAnchorYChange} rigState={rigState} />
      </CharacterModelBoundary>
    );
  }

  if (rigState?.rigType !== "ue4-mannequin") {
    return fallback;
  }

  return (
    <CharacterModelBoundary fallback={fallback}>
      <UE4MannequinModel
        bodyType={bodyType}
        color={color}
        onLabelAnchorYChange={onLabelAnchorYChange}
        rigState={rigState}
      />
    </CharacterModelBoundary>
  );
}
