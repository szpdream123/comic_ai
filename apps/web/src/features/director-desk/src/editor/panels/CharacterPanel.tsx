import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { LocateFixed, MapPinPlus, PencilLine, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import {
  InspectorAxisGroup,
  InspectorColorField,
  InspectorPanel,
  InspectorRangeNumberField,
  InspectorTextField,
  InspectorSection,
} from "./InspectorControls";
import { MANNEQUIN_POSE_PRESETS } from "../presets/mannequinPosePresets";
import { CHARACTER_ACTION_PRESETS } from "../presets/characterActionPresets";
import { getCameraMotionPath } from "../schema/cameraMotion";
import { getObjectMotionSnapshot, normalizeObjectMotionPath } from "../schema/objectMotion";
import { createImportedCharacterActionId } from "../schema/importedCharacterAction";
import { DIRECTOR_CHARACTER_BONE_PARTS } from "../schema/semanticBody";
import { getCrowdAnchorTransform, useDirectorStore } from "../store/directorStore";
import { isCharacterAnimationCompatible } from "./characterAnimationCompatibility";
import type { DirectorAnimationAssetRef } from "../schema/directorProject";

const EMPTY_ANIMATION_ASSETS: DirectorAnimationAssetRef[] = [];

function replaceAxis(tuple: [number, number, number], axis: 0 | 1 | 2, value: number): [number, number, number] {
  return tuple.map((item, index) => (index === axis ? value : item)) as [number, number, number];
}

const CHARACTER_TRANSFORM_DISPLAY_PRECISION = 2;
const ROUTE_MARQUEE_DRAG_THRESHOLD = 4;

export function CharacterPanel() {
  const [activeTab, setActiveTab] = useState<"properties" | "pose" | "action" | "route">("properties");
  const [selectedRoutePointIds, setSelectedRoutePointIds] = useState<string[]>([]);
  const [routeMarquee, setRouteMarquee] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [pendingRoutePointDeletion, setPendingRoutePointDeletion] = useState<string[] | null>(null);
  const routePointButtonsRef = useRef(new Map<string, HTMLButtonElement>());
  const routePointerStartRef = useRef<{ pointerId: number; clientX: number; clientY: number; left: number; top: number } | null>(null);
  const routeMarqueeActiveRef = useRef(false);
  const routeMarqueeSelectionRef = useRef<string[]>([]);
  const routeSelectionRoleIdRef = useRef<string | null>(null);
  const suppressRoutePointClickRef = useRef(false);
  const selectedCrowdId = useDirectorStore((state) => state.selectedCrowdId);
  const selectedObjectId = useDirectorStore((state) => state.selectedObjectId);
  const objects = useDirectorStore((state) => state.project.objects);
  const assets = useDirectorStore((state) => state.project.assets);
  const animationAssets = useDirectorStore((state) => state.project.animationAssets ?? EMPTY_ANIMATION_ASSETS);
  const cameras = useDirectorStore((state) => state.project.cameras);
  const activeCameraId = useDirectorStore((state) => state.project.activeCameraId);
  const cameraMotionProgress = useDirectorStore((state) => state.cameraMotionProgress);
  const updateObjectName = useDirectorStore((state) => state.updateObjectName);
  const updateCrowdLabel = useDirectorStore((state) => state.updateCrowdLabel);
  const updateObjectDisplayTransform = useDirectorStore((state) => state.updateObjectDisplayTransform);
  const updateCrowdTransform = useDirectorStore((state) => state.updateCrowdTransform);
  const updateCrowdUniformScale = useDirectorStore((state) => state.updateCrowdUniformScale);
  const updateObjectColor = useDirectorStore((state) => state.updateObjectColor);
  const updateCrowdColor = useDirectorStore((state) => state.updateCrowdColor);
  const applyPosePreset = useDirectorStore((state) => state.applyPosePreset);
  const applyCrowdPosePreset = useDirectorStore((state) => state.applyCrowdPosePreset);
  const updatePoseControl = useDirectorStore((state) => state.updatePoseControl);
  const updateCrowdPoseControl = useDirectorStore((state) => state.updateCrowdPoseControl);
  const applyCharacterActionPreset = useDirectorStore((state) => state.applyCharacterActionPreset);
  const applyCrowdActionPreset = useDirectorStore((state) => state.applyCrowdActionPreset);
  const updateCharacterAssetBoneMap = useDirectorStore((state) => state.updateCharacterAssetBoneMap);
  const setCameraMotionProgress = useDirectorStore((state) => state.setCameraMotionProgress);
  const setCameraMotionPlaying = useDirectorStore((state) => state.setCameraMotionPlaying);
  const setViewMode = useDirectorStore((state) => state.setViewMode);
  const setShowCharacterRoutes = useDirectorStore((state) => state.setShowCharacterRoutes);
  const addCharacterRoutePoint = useDirectorStore((state) => state.addCharacterRoutePoint);
  const characterRouteDrawingObjectId = useDirectorStore((state) => state.characterRouteDrawingObjectId);
  const setCharacterRouteDrawingObjectId = useDirectorStore((state) => state.setCharacterRouteDrawingObjectId);
  const insertObjectMotionKeyframeAfter = useDirectorStore((state) => state.insertObjectMotionKeyframeAfter);
  const deleteObjectMotionKeyframe = useDirectorStore((state) => state.deleteObjectMotionKeyframe);
  const beginUndoBatch = useDirectorStore((state) => state.beginUndoBatch);
  const endUndoBatch = useDirectorStore((state) => state.endUndoBatch);
  const selectedObjectMotionKeyframeId = useDirectorStore((state) => state.selectedObjectMotionKeyframeId);
  const selectObjectMotionKeyframe = useDirectorStore((state) => state.selectObjectMotionKeyframe);
  const updateObjectMotionKeyframe = useDirectorStore((state) => state.updateObjectMotionKeyframe);
  const updateObjectMotionPath = useDirectorStore((state) => state.updateObjectMotionPath);
  const transformMode = useDirectorStore((state) => state.transformMode);
  const setTransformMode = useDirectorStore((state) => state.setTransformMode);

  useEffect(() => {
    if (transformMode === "pose") {
      setActiveTab("pose");
    }
  }, [transformMode]);

  function selectInspectorTab(tab: "properties" | "pose" | "action" | "route") {
    setActiveTab(tab);
    if (tab === "pose") {
      setTransformMode("pose");
    } else if (transformMode === "pose") {
      setTransformMode("translate");
    }
  }

  const selection = useMemo(() => {
    const role = objects.find((item) => item.id === selectedObjectId && item.kind === "character");

    if (selectedCrowdId) {
      const crowdMembers = objects.filter((item) => item.kind === "character" && item.crowdId === selectedCrowdId);
      const crowdAnchor = getCrowdAnchorTransform(objects, selectedCrowdId);

      if (crowdMembers.length && crowdAnchor) {
        return {
          mode: "crowd" as const,
          crowdId: selectedCrowdId,
          crowdMembers,
          crowdAnchor,
          role: crowdMembers[crowdMembers.length - 1] ?? crowdMembers[0],
          name: crowdMembers[0]?.crowdLabel ?? "群众",
          color: crowdMembers[0]?.color ?? "#4F8EF7",
        };
      }
    }

    if (!role) return null;

    return {
      mode: "single" as const,
      crowdId: null,
      crowdMembers: [role],
      crowdAnchor: role.transform,
      role,
      name: role.name,
      color: role.color ?? "#4F8EF7",
    };
  }, [objects, selectedCrowdId, selectedObjectId]);

  const selectedRouteRole = selection?.mode === "single" ? selection.role : null;
  const routePointIds = selectedRouteRole
    ? normalizeObjectMotionPath(selectedRouteRole.motionPath, selectedRouteRole.transform).keyframes.map((point) => point.id)
    : [];
  const routePointIdSignature = routePointIds.join("\u0000");

  useEffect(() => {
    const validIds = new Set(routePointIds);
    const roleChanged = routeSelectionRoleIdRef.current !== selectedRouteRole?.id;
    routeSelectionRoleIdRef.current = selectedRouteRole?.id ?? null;

    setSelectedRoutePointIds((current) => {
      if (roleChanged) {
        return selectedObjectMotionKeyframeId && validIds.has(selectedObjectMotionKeyframeId)
          ? [selectedObjectMotionKeyframeId]
          : [];
      }

      const next = current.filter((id) => validIds.has(id));
      if (selectedObjectMotionKeyframeId && validIds.has(selectedObjectMotionKeyframeId) && !next.includes(selectedObjectMotionKeyframeId)) {
        return [selectedObjectMotionKeyframeId];
      }
      return next.length === current.length ? current : next;
    });
  }, [routePointIdSignature, selectedObjectMotionKeyframeId, selectedRouteRole?.id]);

  if (!selection) return null;

  const role = selection.role;
  const roleColor = selection.color;
  const isCrowd = selection.mode === "crowd";
  const transform = isCrowd
    ? selection.crowdAnchor
    : getObjectMotionSnapshot(role, cameraMotionProgress);
  const routePath = normalizeObjectMotionPath(role.motionPath, role.transform);
  const selectedRoutePoint = routePath.keyframes.find((item) => item.id === selectedObjectMotionKeyframeId) ?? null;
  const validRoutePointIds = new Set(routePath.keyframes.map((point) => point.id));
  const routeDeleteIds = selectedRoutePointIds.filter((id) => validRoutePointIds.has(id));
  const activeCamera = cameras.find((item) => item.id === activeCameraId) ?? cameras[0];
  const timelineDuration = activeCamera ? getCameraMotionPath(activeCamera).duration : 6;
  const characterAsset = role.assetRefId ? assets.find((asset) => asset.id === role.assetRefId) : undefined;
  const compatibleAnimationAssets = animationAssets.filter((asset) => isCharacterAnimationCompatible(characterAsset, asset));
  const poseGroups = [
    {
      title: "身体",
      controls: [
        { key: "body.pitch", label: "前倾" },
        { key: "body.yaw", label: "转身" },
        { key: "body.roll", label: "侧倾" },
      ],
    },
    {
      title: "躯干",
      controls: [
        { key: "torso.pitch", label: "前倾" },
        { key: "torso.yaw", label: "扭转" },
        { key: "torso.roll", label: "侧倾" },
      ],
    },
    {
      title: "头部",
      controls: [
        { key: "head.pitch", label: "点头" },
        { key: "head.yaw", label: "转头" },
        { key: "head.roll", label: "歪头" },
      ],
    },
    {
      title: "左肩",
      controls: [
        { key: "leftShoulder.pitch", label: "前举" },
        { key: "leftShoulder.spread", label: "外展" },
        { key: "leftShoulder.twist", label: "扭转" },
      ],
    },
    {
      title: "右肩",
      controls: [
        { key: "rightShoulder.pitch", label: "前举" },
        { key: "rightShoulder.spread", label: "外展" },
        { key: "rightShoulder.twist", label: "扭转" },
      ],
    },
    {
      title: "左肘",
      controls: [{ key: "leftElbow.bend", label: "弯曲" }],
    },
    {
      title: "右肘",
      controls: [{ key: "rightElbow.bend", label: "弯曲" }],
    },
    {
      title: "左髋",
      controls: [
        { key: "leftHip.pitch", label: "前抬" },
        { key: "leftHip.spread", label: "外展" },
        { key: "leftHip.twist", label: "扭转" },
      ],
    },
    {
      title: "右髋",
      controls: [
        { key: "rightHip.pitch", label: "前抬" },
        { key: "rightHip.spread", label: "外展" },
        { key: "rightHip.twist", label: "扭转" },
      ],
    },
    {
      title: "左膝",
      controls: [{ key: "leftKnee.bend", label: "弯曲" }],
    },
    {
      title: "右膝",
      controls: [{ key: "rightKnee.bend", label: "弯曲" }],
    },
  ] as const;

  function handleRoutePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    routePointerStartRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      left: bounds.left,
      top: bounds.top,
    };
    routeMarqueeActiveRef.current = false;
    routeMarqueeSelectionRef.current = selectedRoutePointIds;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handleRoutePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = routePointerStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - start.clientX;
    const deltaY = event.clientY - start.clientY;
    if (Math.hypot(deltaX, deltaY) < ROUTE_MARQUEE_DRAG_THRESHOLD) return;

    event.preventDefault();
    routeMarqueeActiveRef.current = true;
    const selectionBounds = {
      left: Math.min(start.clientX, event.clientX),
      right: Math.max(start.clientX, event.clientX),
      top: Math.min(start.clientY, event.clientY),
      bottom: Math.max(start.clientY, event.clientY),
    };
    const nextSelectedIds = routePath.keyframes
      .filter((point) => {
        const pointBounds = routePointButtonsRef.current.get(point.id)?.getBoundingClientRect();
        return pointBounds
          ? pointBounds.right >= selectionBounds.left &&
              pointBounds.left <= selectionBounds.right &&
              pointBounds.bottom >= selectionBounds.top &&
              pointBounds.top <= selectionBounds.bottom
          : false;
      })
      .map((point) => point.id);

    routeMarqueeSelectionRef.current = nextSelectedIds;
    setSelectedRoutePointIds(nextSelectedIds);
    setRouteMarquee({
      left: selectionBounds.left - start.left,
      top: selectionBounds.top - start.top,
      width: selectionBounds.right - selectionBounds.left,
      height: selectionBounds.bottom - selectionBounds.top,
    });
  }

  function finishRouteMarquee(event: ReactPointerEvent<HTMLDivElement>) {
    const start = routePointerStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    routePointerStartRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (routeMarqueeActiveRef.current) {
      const nextSelectedIds = routeMarqueeSelectionRef.current;
      const activePointId = selectedObjectMotionKeyframeId && nextSelectedIds.includes(selectedObjectMotionKeyframeId)
        ? selectedObjectMotionKeyframeId
        : nextSelectedIds[0] ?? null;
      selectObjectMotionKeyframe(activePointId);
      suppressRoutePointClickRef.current = true;
      window.setTimeout(() => {
        suppressRoutePointClickRef.current = false;
      }, 0);
    }
    routeMarqueeActiveRef.current = false;
    setRouteMarquee(null);
  }

  function cancelRouteMarquee(event: ReactPointerEvent<HTMLDivElement>) {
    const start = routePointerStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    routePointerStartRef.current = null;
    routeMarqueeActiveRef.current = false;
    setRouteMarquee(null);
  }

  function deleteRoutePoints(pointIds: string[]) {
    if (pointIds.length === 0) return;
    if (pointIds.length === 1) {
      deleteObjectMotionKeyframe(role.id, pointIds[0]);
    } else {
      beginUndoBatch();
      try {
        pointIds.forEach((pointId) => deleteObjectMotionKeyframe(role.id, pointId));
      } finally {
        endUndoBatch();
      }
    }
    setSelectedRoutePointIds([]);
    selectObjectMotionKeyframe(null);
  }

  return (
    <>
    <InspectorPanel
      title="角色"
      ariaLabel="角色右侧属性面板"
      className="character-inspector"
      tabs={[
        { label: "属性", active: activeTab === "properties", onClick: () => selectInspectorTab("properties") },
        { label: "姿势", active: activeTab === "pose", onClick: () => selectInspectorTab("pose") },
        { label: "动作", active: activeTab === "action", onClick: () => selectInspectorTab("action") },
        { label: "路线", active: activeTab === "route", onClick: () => selectInspectorTab("route") },
      ]}
    >
      {activeTab === "properties" ? (
        <>
          <InspectorTextField
            label="名称"
            ariaLabel="角色名称"
            value={selection.name}
            onChange={(value) => {
              if (isCrowd && selection.crowdId) {
                updateCrowdLabel(selection.crowdId, value);
                return;
              }

              updateObjectName(role.id, value);
            }}
          />
          <InspectorAxisGroup
            label="位置"
            axes={[
              {
                axis: "X",
                ariaLabel: "角色位置 X",
                displayPrecision: CHARACTER_TRANSFORM_DISPLAY_PRECISION,
                value: transform.position[0],
                onChange: (value) =>
                  isCrowd && selection.crowdId
                    ? updateCrowdTransform(selection.crowdId, {
                        position: replaceAxis(transform.position, 0, Number(value)),
                      })
                    : updateObjectDisplayTransform(role.id, {
                        position: replaceAxis(transform.position, 0, Number(value)),
                      }),
              },
              {
                axis: "Y",
                ariaLabel: "角色位置 Y",
                displayPrecision: CHARACTER_TRANSFORM_DISPLAY_PRECISION,
                value: transform.position[1],
                onChange: (value) =>
                  isCrowd && selection.crowdId
                    ? updateCrowdTransform(selection.crowdId, {
                        position: replaceAxis(transform.position, 1, Number(value)),
                      })
                    : updateObjectDisplayTransform(role.id, {
                        position: replaceAxis(transform.position, 1, Number(value)),
                      }),
              },
              {
                axis: "Z",
                ariaLabel: "角色位置 Z",
                displayPrecision: CHARACTER_TRANSFORM_DISPLAY_PRECISION,
                value: transform.position[2],
                onChange: (value) =>
                  isCrowd && selection.crowdId
                    ? updateCrowdTransform(selection.crowdId, {
                        position: replaceAxis(transform.position, 2, Number(value)),
                      })
                    : updateObjectDisplayTransform(role.id, {
                        position: replaceAxis(transform.position, 2, Number(value)),
                      }),
              },
            ]}
          />
          <InspectorAxisGroup
            label="旋转"
            axes={[
              {
                axis: "X",
                ariaLabel: "角色旋转 X",
                displayPrecision: CHARACTER_TRANSFORM_DISPLAY_PRECISION,
                value: transform.rotation[0],
                onChange: (value) =>
                  isCrowd && selection.crowdId
                    ? updateCrowdTransform(selection.crowdId, {
                        rotation: replaceAxis(transform.rotation, 0, Number(value)),
                      })
                    : updateObjectDisplayTransform(role.id, {
                        rotation: replaceAxis(transform.rotation, 0, Number(value)),
                      }),
              },
              {
                axis: "Y",
                ariaLabel: "角色旋转 Y",
                displayPrecision: CHARACTER_TRANSFORM_DISPLAY_PRECISION,
                value: transform.rotation[1],
                onChange: (value) =>
                  isCrowd && selection.crowdId
                    ? updateCrowdTransform(selection.crowdId, {
                        rotation: replaceAxis(transform.rotation, 1, Number(value)),
                      })
                    : updateObjectDisplayTransform(role.id, {
                        rotation: replaceAxis(transform.rotation, 1, Number(value)),
                      }),
              },
              {
                axis: "Z",
                ariaLabel: "角色旋转 Z",
                displayPrecision: CHARACTER_TRANSFORM_DISPLAY_PRECISION,
                value: transform.rotation[2],
                onChange: (value) =>
                  isCrowd && selection.crowdId
                    ? updateCrowdTransform(selection.crowdId, {
                        rotation: replaceAxis(transform.rotation, 2, Number(value)),
                      })
                    : updateObjectDisplayTransform(role.id, {
                        rotation: replaceAxis(transform.rotation, 2, Number(value)),
                      }),
              },
            ]}
          />
          <InspectorAxisGroup
            label="缩放"
            axes={[
              {
                axis: "X",
                ariaLabel: "角色缩放 X",
                displayPrecision: CHARACTER_TRANSFORM_DISPLAY_PRECISION,
                step: "0.01",
                value: transform.scale[0],
                onChange: (value) =>
                  isCrowd && selection.crowdId
                    ? updateCrowdTransform(selection.crowdId, {
                        scale: replaceAxis(transform.scale, 0, Number(value)),
                      })
                    : updateObjectDisplayTransform(role.id, {
                        scale: replaceAxis(transform.scale, 0, Number(value)),
                      }),
              },
              {
                axis: "Y",
                ariaLabel: "角色缩放 Y",
                displayPrecision: CHARACTER_TRANSFORM_DISPLAY_PRECISION,
                step: "0.01",
                value: transform.scale[1],
                onChange: (value) =>
                  isCrowd && selection.crowdId
                    ? updateCrowdTransform(selection.crowdId, {
                        scale: replaceAxis(transform.scale, 1, Number(value)),
                      })
                    : updateObjectDisplayTransform(role.id, {
                        scale: replaceAxis(transform.scale, 1, Number(value)),
                      }),
              },
              {
                axis: "Z",
                ariaLabel: "角色缩放 Z",
                displayPrecision: CHARACTER_TRANSFORM_DISPLAY_PRECISION,
                step: "0.01",
                value: transform.scale[2],
                onChange: (value) =>
                  isCrowd && selection.crowdId
                    ? updateCrowdTransform(selection.crowdId, {
                        scale: replaceAxis(transform.scale, 2, Number(value)),
                      })
                    : updateObjectDisplayTransform(role.id, {
                        scale: replaceAxis(transform.scale, 2, Number(value)),
                      }),
              },
            ]}
          />
          <InspectorRangeNumberField
            label="统一缩放"
            rangeAriaLabel="角色统一缩放滑杆"
            numberAriaLabel="角色统一缩放"
            max="3"
            min="0.2"
            step="0.01"
            value={transform.scale[0]}
            onValueChange={(value) =>
              isCrowd && selection.crowdId
                ? updateCrowdUniformScale(selection.crowdId, Number(value))
                : updateObjectDisplayTransform(role.id, {
                    scale: [Number(value), Number(value), Number(value)],
                  })
            }
          />
          <InspectorColorField
            label="颜色"
            colorAriaLabel="角色颜色"
            hexAriaLabel="角色颜色 HEX"
            value={roleColor}
            onColorChange={(value) =>
              isCrowd && selection.crowdId ? updateCrowdColor(selection.crowdId, value) : updateObjectColor(role.id, value)
            }
            onHexChange={(value) =>
              isCrowd && selection.crowdId ? updateCrowdColor(selection.crowdId, value) : updateObjectColor(role.id, value)
            }
          />
        </>
      ) : activeTab === "pose" ? (
        <InspectorSection title="姿势预设" className="pose-preset-section">
          {role.characterRig ? (
            <>
              <div className="preset-grid">
                {MANNEQUIN_POSE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    className={role.characterRig?.posePresetId === preset.id ? "is-active" : undefined}
                    type="button"
                    onClick={() =>
                      isCrowd && selection.crowdId
                        ? applyCrowdPosePreset(selection.crowdId, preset.id)
                        : applyPosePreset(role.id, preset.id)
                    }
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <InspectorSection title="姿势调节" className="pose-adjust-section">
                <div className="pose-groups">
                  {poseGroups.map((group) => (
                    <section key={group.title} className="pose-group">
                      <h4>{group.title}</h4>
                      {group.controls.map((control) => (
                        <InspectorRangeNumberField
                          key={control.key}
                          label={control.label}
                          rangeAriaLabel={`${group.title} · ${control.label} 滑杆`}
                          numberAriaLabel={`${group.title} · ${control.label}`}
                          max="90"
                          min="-90"
                          step="1"
                          value={role.characterRig?.controls[control.key] ?? 0}
                          onValueChange={(value) =>
                            isCrowd && selection.crowdId
                              ? updateCrowdPoseControl(selection.crowdId, control.key, Number(value))
                              : updatePoseControl(role.id, control.key, Number(value))
                          }
                        />
                      ))}
                    </section>
                  ))}
                </div>
              </InspectorSection>
              {!isCrowd && characterAsset?.characterBoneNames?.length ? (
                <InspectorSection title="骨骼映射" className="pose-adjust-section">
                  <p>自动识别结果可按模型实际骨骼名修正；完整映射后可绑定通用动作文件。</p>
                  <div className="pose-groups">
                    {DIRECTOR_CHARACTER_BONE_PARTS.map((part) => (
                      <label key={part} className="inspector-field">
                        <span>{part}</span>
                        <select
                          aria-label={`映射 ${part} 骨骼`}
                          value={characterAsset.characterBoneMap?.[part] ?? ""}
                          onChange={(event) => updateCharacterAssetBoneMap(characterAsset.id, {
                            ...characterAsset.characterBoneMap,
                            [part]: event.currentTarget.value || undefined,
                          })}
                        >
                          <option value="">未映射</option>
                          {(characterAsset.characterBoneNames ?? []).map((boneName) => (
                            <option key={boneName} value={boneName}>{boneName}</option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                </InspectorSection>
              ) : null}
            </>
          ) : (
            <p>该模型未识别到标准 humanoid 骨骼，暂不支持姿势编辑。</p>
          )}
        </InspectorSection>
      ) : activeTab === "action" ? (
        <InspectorSection title="动作预设" className="pose-preset-section">
          <div className="preset-grid">
            <button
              className={!role.characterRig?.actionPresetId ? "is-active" : undefined}
              type="button"
              onClick={() => {
                if (isCrowd && selection.crowdId) applyCrowdActionPreset(selection.crowdId, null);
                else applyCharacterActionPreset(role.id, null);
                setCameraMotionPlaying(false);
              }}
            >
              无动作
            </button>
            {CHARACTER_ACTION_PRESETS.map((preset) => (
              <button
                key={preset.id}
                className={role.characterRig?.actionPresetId === preset.id ? "is-active" : undefined}
                type="button"
                aria-label={`播放动作 ${preset.label}`}
                onClick={() => {
                  if (isCrowd && selection.crowdId) applyCrowdActionPreset(selection.crowdId, preset.id);
                  else applyCharacterActionPreset(role.id, preset.id);
                  setCameraMotionProgress(0);
                  setCameraMotionPlaying(true);
                }}
              >
                <span>{preset.label}</span>
                <small>{preset.duration.toFixed(2)} 秒</small>
              </button>
            ))}
            {compatibleAnimationAssets.flatMap((asset) => asset.clips.map((clip) => ({ asset, clip }))).map(({ asset, clip }) => {
              const actionId = createImportedCharacterActionId(asset.id, clip.name);
              return (
                <button
                  key={actionId}
                  className={role.characterRig?.actionPresetId === actionId ? "is-active" : undefined}
                  type="button"
                  aria-label={`播放导入动作 ${clip.name}`}
                  onClick={() => {
                    applyCharacterActionPreset(role.id, actionId);
                    setCameraMotionProgress(0);
                    setCameraMotionPlaying(true);
                  }}
                >
                  <span>{clip.name}</span>
                  <small>{asset.name}</small>
                </button>
              );
            })}
          </div>
          {!isCrowd && characterAsset?.sourceType === "model" && animationAssets.length && !compatibleAnimationAssets.length ? (
            <p>没有兼容的动作文件。请完成骨骼映射，或导入同一骨架类型的动作。</p>
          ) : null}
        </InspectorSection>
      ) : (
        <InspectorSection title="人物路线" className="pose-preset-section">
          {isCrowd ? (
            <p>群众组暂不支持共用路线。请先选中单个人物。</p>
          ) : (
            <>
              <div className="character-route-toolbar" aria-label="路线编辑操作">
                <button
                  className="character-route-add"
                  type="button"
                  onClick={() => {
                    setCameraMotionPlaying(false);
                    const id = addCharacterRoutePoint(role.id);
                    if (id) {
                      setSelectedRoutePointIds([id]);
                      selectObjectMotionKeyframe(id);
                    }
                  }}
                >
                  <MapPinPlus aria-hidden="true" size={14} />
                  添加点
                </button>
                <button
                  aria-label="预览当前路线点"
                  title="定位预览"
                  className="character-route-icon-button"
                  type="button"
                  disabled={!selectedRoutePoint}
                  onClick={() => {
                    if (selectedRoutePoint) setCameraMotionProgress(selectedRoutePoint.time);
                  }}
                >
                  <LocateFixed aria-hidden="true" size={14} />
                </button>
                <button
                  aria-label="在当前路线点后插入"
                  title="在当前点后插入"
                  className="character-route-icon-button"
                  type="button"
                  disabled={!selectedRoutePoint || routePath.keyframes[routePath.keyframes.length - 1]?.id === selectedRoutePoint.id}
                  onClick={() => {
                    if (!selectedRoutePoint) return;
                    const id = insertObjectMotionKeyframeAfter(role.id, selectedRoutePoint.id);
                    if (id) selectObjectMotionKeyframe(id);
                  }}
                >
                  <Plus aria-hidden="true" size={15} />
                </button>
                <button
                  aria-label={routeDeleteIds.length > 1 ? `删除选中的 ${routeDeleteIds.length} 个路线点` : "删除当前路线点"}
                  title={routeDeleteIds.length > 1 ? `删除选中的 ${routeDeleteIds.length} 个点` : "删除当前点"}
                  className="character-route-icon-button is-danger"
                  type="button"
                  disabled={routeDeleteIds.length === 0}
                  onClick={() => {
                    if (routeDeleteIds.length > 1) {
                      setPendingRoutePointDeletion(routeDeleteIds);
                      return;
                    }
                    deleteRoutePoints(routeDeleteIds);
                  }}
                >
                  <Trash2 aria-hidden="true" size={14} />
                </button>
                <button
                  aria-label="绘制人物路线"
                  aria-pressed={characterRouteDrawingObjectId === role.id}
                  title={characterRouteDrawingObjectId === role.id ? "结束手绘人物路线" : "在场景中手绘人物路线"}
                  className={`character-route-draw-button${characterRouteDrawingObjectId === role.id ? " is-active" : ""}`}
                  type="button"
                  onClick={() => {
                    const drawing = characterRouteDrawingObjectId === role.id;
                    setViewMode("director");
                    setCameraMotionPlaying(false);
                    selectObjectMotionKeyframe(null);
                    setShowCharacterRoutes(true);
                    setCharacterRouteDrawingObjectId(drawing ? null : role.id);
                  }}
                >
                  <PencilLine aria-hidden="true" size={14} />
                  <span>{characterRouteDrawingObjectId === role.id ? "结束手绘路线" : "手绘人物路线"}</span>
                </button>
              </div>
              <div className="character-route-shape" role="group" aria-label="路线形状">
                <span>路线</span>
                <button
                  type="button"
                  aria-pressed={routePath.interpolation === "smooth"}
                  onClick={() => updateObjectMotionPath(role.id, { interpolation: "smooth" })}
                >
                  平滑曲线
                </button>
                <button
                  type="button"
                  aria-pressed={routePath.interpolation === "linear"}
                  onClick={() => updateObjectMotionPath(role.id, { interpolation: "linear" })}
                >
                  直线
                </button>
              </div>
              <div
                className="character-route-points"
                role="group"
                aria-label="人物路线点列表"
                onPointerDown={handleRoutePointerDown}
                onPointerMove={handleRoutePointerMove}
                onPointerUp={finishRouteMarquee}
                onPointerCancel={cancelRouteMarquee}
              >
                {routePath.keyframes.map((point, index) => (
                  <button
                    key={point.id}
                    ref={(node) => {
                      if (node) routePointButtonsRef.current.set(point.id, node);
                      else routePointButtonsRef.current.delete(point.id);
                    }}
                    className={`${selectedRoutePointIds.includes(point.id) ? "is-selected" : ""}${point.id === selectedRoutePoint?.id ? " is-active" : ""}`.trim() || undefined}
                    type="button"
                    aria-label={`选择路线点 ${index + 1}`}
                    aria-pressed={selectedRoutePointIds.includes(point.id)}
                    onClick={(event) => {
                      if (suppressRoutePointClickRef.current) {
                        event.preventDefault();
                        return;
                      }
                      setSelectedRoutePointIds([point.id]);
                      selectObjectMotionKeyframe(point.id);
                    }}
                  >
                    <strong>{index + 1}</strong>
                    <span>{(point.time * timelineDuration).toFixed(1)} 秒</span>
                  </button>
                ))}
                {routeMarquee ? <span className="character-route-marquee" style={routeMarquee} aria-hidden="true" /> : null}
              </div>
              {selectedRoutePoint ? (
                <InspectorSection title={`路线点 ${routePath.keyframes.findIndex((point) => point.id === selectedRoutePoint.id) + 1}`} className="character-route-editor">
                  <InspectorRangeNumberField
                    label="到达时间"
                    rangeAriaLabel="路线点到达时间滑杆"
                    numberAriaLabel="路线点到达时间"
                    min="0"
                    max={String(timelineDuration)}
                    step="0.1"
                    value={selectedRoutePoint.time * timelineDuration}
                    onValueChange={(value) => updateObjectMotionKeyframe(role.id, selectedRoutePoint.id, {
                      time: Math.min(1, Math.max(0, Number(value) / timelineDuration)),
                    })}
                  />
                  <InspectorAxisGroup
                    label="路线点位置"
                    axes={([0, 1, 2] as const).map((axis) => ({
                      axis: (["X", "Y", "Z"] as const)[axis],
                      ariaLabel: `路线点位置 ${(["X", "Y", "Z"] as const)[axis]}`,
                      displayPrecision: CHARACTER_TRANSFORM_DISPLAY_PRECISION,
                      value: selectedRoutePoint.transform.position[axis],
                      onChange: (value: string) => updateObjectMotionKeyframe(role.id, selectedRoutePoint.id, {
                        transform: { position: replaceAxis(selectedRoutePoint.transform.position, axis, Number(value)) },
                      }),
                    }))}
                  />
                  <label className="inspector-field">
                    <span className="inspector-field-label">本段动作</span>
                    <select
                      aria-label="路线点本段动作"
                      value={selectedRoutePoint.actionPresetId ?? ""}
                      onChange={(event) => updateObjectMotionKeyframe(role.id, selectedRoutePoint.id, {
                        actionPresetId: event.currentTarget.value || null,
                      })}
                    >
                      <option value="">自动行走</option>
                      {CHARACTER_ACTION_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                    </select>
                  </label>
                  <label className="inspector-field">
                    <span className="inspector-field-label">到点朝向</span>
                    <select
                      aria-label="路线点朝向方式"
                      value={selectedRoutePoint.facingMode ?? "manual"}
                      onChange={(event) => updateObjectMotionKeyframe(role.id, selectedRoutePoint.id, {
                        facingMode: event.currentTarget.value === "path" ? "path" : "manual",
                      })}
                    >
                      <option value="path">面向下一个点</option>
                      <option value="manual">手动朝向</option>
                    </select>
                  </label>
                  {selectedRoutePoint.facingMode !== "path" ? (
                    <InspectorRangeNumberField
                      label="手动朝向"
                      rangeAriaLabel="路线点手动朝向滑杆"
                      numberAriaLabel="路线点手动朝向"
                      min="-180"
                      max="180"
                      step="1"
                      value={selectedRoutePoint.transform.rotation[1] * 180 / Math.PI}
                      onValueChange={(value) => updateObjectMotionKeyframe(role.id, selectedRoutePoint.id, {
                        transform: {
                          rotation: replaceAxis(
                            selectedRoutePoint.transform.rotation,
                            1,
                            Number(value) * Math.PI / 180
                          ),
                        },
                      })}
                    />
                  ) : null}
                </InspectorSection>
              ) : <p>添加第一个路线点后，可在场景里拖动编号点继续摆路线。</p>}
            </>
          )}
        </InspectorSection>
      )}
    </InspectorPanel>
    {pendingRoutePointDeletion ? (
      <ConfirmDialog
        message={`删除选中的 ${pendingRoutePointDeletion.length} 个人物路线点？此操作可通过撤销恢复。`}
        onCancel={() => setPendingRoutePointDeletion(null)}
        onConfirm={() => {
          deleteRoutePoints(pendingRoutePointDeletion);
          setPendingRoutePointDeletion(null);
        }}
      />
    ) : null}
    </>
  );
}
