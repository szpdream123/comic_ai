import {
  Camera,
  ChevronDown,
  ChevronRight,
  Diamond,
  MapPinPlus,
  Package,
  Pause,
  PersonStanding,
  Play,
  Repeat2,
  RotateCcw,
  Trash2,
  X,
  ZoomIn,
} from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { getCameraMotionPath } from "../schema/cameraMotion";
import type { DirectorObjectMotionKeyframe } from "../schema/directorProject";
import { normalizeObjectMotionPath } from "../schema/objectMotion";
import { useDirectorStore } from "../store/directorStore";

const KEYFRAME_TOLERANCE = 0.005;
const RULER_TICK_COUNT = 20;

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remaining.toFixed(1).padStart(4, "0")}`;
}

function formatVector(values: [number, number, number], radians = false) {
  return values.map((value) => (radians ? value * 180 / Math.PI : value).toFixed(1)).join("  ");
}

type TimelineLaneProps = {
  activeKeyframeId: string | null;
  duration: number;
  keyframes: Array<{ id: string; time: number }>;
  label: string;
  progress: number;
  onMoveKeyframe?: (id: string, time: number) => void;
  onSelectKeyframe: (id: string, time: number) => void;
};

function TimelineLane({
  activeKeyframeId,
  duration,
  keyframes,
  label,
  progress,
  onMoveKeyframe,
  onSelectKeyframe,
}: TimelineLaneProps) {
  function moveKeyframe(event: ReactPointerEvent<HTMLButtonElement>, id: string) {
    if (!onMoveKeyframe || event.buttons !== 1) return;
    const lane = event.currentTarget.parentElement;
    if (!lane) return;
    const bounds = lane.getBoundingClientRect();
    const time = Math.min(1, Math.max(0, (event.clientX - bounds.left) / Math.max(1, bounds.width)));
    onMoveKeyframe(id, time);
  }

  return (
    <div className="animation-timeline__lane" aria-label={label}>
      <span className="animation-timeline__playhead-line" style={{ left: `${progress * 100}%` }} aria-hidden="true" />
      {keyframes.map((keyframe) => (
        <button
          key={keyframe.id}
          className={`animation-timeline__keyframe${activeKeyframeId === keyframe.id ? " is-active" : ""}`}
          type="button"
          aria-label={`${label}关键帧，${(keyframe.time * duration).toFixed(1)}秒`}
          aria-pressed={activeKeyframeId === keyframe.id}
          style={{ left: `${keyframe.time * 100}%` }}
          title={`${(keyframe.time * duration).toFixed(1)}s`}
          onClick={() => onSelectKeyframe(keyframe.id, keyframe.time)}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            onSelectKeyframe(keyframe.id, keyframe.time);
          }}
          onPointerMove={(event) => moveKeyframe(event, keyframe.id)}
        >
          <Diamond aria-hidden="true" size={12} fill="currentColor" />
        </button>
      ))}
    </div>
  );
}

export function AnimationTimeline({ onClose }: { onClose: () => void }) {
  const progress = useDirectorStore((state) => state.cameraMotionProgress);
  const playing = useDirectorStore((state) => state.cameraMotionPlaying);
  const selectedObjectId = useDirectorStore((state) => state.selectedObjectId);
  const selectedObjectKeyframeId = useDirectorStore((state) => state.selectedObjectMotionKeyframeId);
  const selectedCameraKeyframeId = useDirectorStore((state) => state.selectedCameraKeyframeId);
  const objects = useDirectorStore((state) => state.project.objects);
  const activeCamera = useDirectorStore((state) =>
    state.project.cameras.find((camera) => camera.id === state.project.activeCameraId)
      ?? state.project.cameras[0]
  );
  const selectObject = useDirectorStore((state) => state.selectObject);
  const selectObjectMotionKeyframe = useDirectorStore((state) => state.selectObjectMotionKeyframe);
  const selectCameraMotionKeyframe = useDirectorStore((state) => state.selectCameraMotionKeyframe);
  const addObjectMotionKeyframe = useDirectorStore((state) => state.addObjectMotionKeyframe);
  const updateObjectMotionKeyframe = useDirectorStore((state) => state.updateObjectMotionKeyframe);
  const deleteObjectMotionKeyframe = useDirectorStore((state) => state.deleteObjectMotionKeyframe);
  const updateCameraMotionKeyframe = useDirectorStore((state) => state.updateCameraMotionKeyframe);
  const deleteCameraMotionKeyframe = useDirectorStore((state) => state.deleteCameraMotionKeyframe);
  const updateCameraMotionPath = useDirectorStore((state) => state.updateCameraMotionPath);
  const setProgress = useDirectorStore((state) => state.setCameraMotionProgress);
  const setPlaying = useDirectorStore((state) => state.setCameraMotionPlaying);
  const [zoom, setZoom] = useState(100);
  const [expandedTrackIds, setExpandedTrackIds] = useState<Set<string>>(() => new Set());

  const cameraPath = useMemo(() => activeCamera ? getCameraMotionPath(activeCamera) : null, [activeCamera]);
  const duration = cameraPath?.duration ?? 6;
  const timelineObjects = useMemo(
    () => objects.filter((object) => object.kind === "character" || object.kind === "prop"),
    [objects]
  );
  const selectedObject = timelineObjects.find((object) => object.id === selectedObjectId);
  const selectedObjectPath = selectedObject
    ? normalizeObjectMotionPath(selectedObject.motionPath, selectedObject.transform)
    : null;
  const selectedObjectKeyframe = selectedObjectPath?.keyframes.find(
    (keyframe) => keyframe.id === selectedObjectKeyframeId
  );
  const canRecordObject = selectedObject?.kind === "prop";
  const hasPlayableMotion =
    (cameraPath?.keyframes.length ?? 0) >= 2
    || timelineObjects.some((object) => (object.motionPath?.keyframes.length ?? 0) >= 2);
  const rowsStyle = {
    width: `${zoom}%`,
    minWidth: `${Math.round(920 * zoom / 100)}px`,
  } as CSSProperties;

  useEffect(() => {
    if (!selectedObjectId) return;
    setExpandedTrackIds((current) => {
      if (current.has(selectedObjectId)) return current;
      const next = new Set(current);
      next.add(selectedObjectId);
      return next;
    });
  }, [selectedObjectId]);

  function seek(nextProgress: number) {
    setPlaying(false);
    setProgress(Math.min(1, Math.max(0, nextProgress)));
  }

  function togglePlayback() {
    if (!hasPlayableMotion) return;
    if (playing) {
      setPlaying(false);
      return;
    }
    if (progress >= 1 - KEYFRAME_TOLERANCE) setProgress(0);
    setPlaying(true);
  }

  function toggleTrack(trackId: string) {
    setExpandedTrackIds((current) => {
      const next = new Set(current);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
  }

  function selectObjectKeyframe(objectId: string, keyframeId: string, time: number) {
    selectObject(objectId);
    selectCameraMotionKeyframe(null);
    selectObjectMotionKeyframe(keyframeId);
    seek(time);
  }

  function selectCameraKeyframe(keyframeId: string, time: number) {
    selectObjectMotionKeyframe(null);
    selectCameraMotionKeyframe(keyframeId);
    seek(time);
  }

  function recordCurrentObject() {
    if (!selectedObject || !canRecordObject) return;
    setPlaying(false);
    const keyframeId = addObjectMotionKeyframe(selectedObject.id, progress);
    if (keyframeId) selectObjectMotionKeyframe(keyframeId);
  }

  function deleteSelectedKeyframe() {
    setPlaying(false);
    if (selectedObject && selectedObjectKeyframeId && selectedObjectKeyframe) {
      deleteObjectMotionKeyframe(selectedObject.id, selectedObjectKeyframeId);
      return;
    }
    if (activeCamera && selectedCameraKeyframeId) {
      deleteCameraMotionKeyframe(activeCamera.id, selectedCameraKeyframeId);
    }
  }

  function renderObjectPropertyRows(
    objectId: string,
    keyframes: DirectorObjectMotionKeyframe[],
    property: "position" | "rotation" | "scale",
    label: string,
  ) {
    const current = keyframes.find((keyframe) => keyframe.id === selectedObjectKeyframeId) ?? keyframes[0];
    const values = current?.transform[property];
    return (
      <div className="animation-timeline__row animation-timeline__row--property" key={`${objectId}-${property}`}>
        <div className="animation-timeline__track-label animation-timeline__track-label--property">
          <span>{label}</span>
          <small>{values ? formatVector(values, property === "rotation") : "-"}</small>
        </div>
        <TimelineLane
          activeKeyframeId={selectedObjectId === objectId ? selectedObjectKeyframeId : null}
          duration={duration}
          keyframes={keyframes}
          label={`${label}轨道`}
          progress={progress}
          onMoveKeyframe={(keyframeId, time) => {
            updateObjectMotionKeyframe(objectId, keyframeId, { time });
            seek(time);
          }}
          onSelectKeyframe={(keyframeId, time) => selectObjectKeyframe(objectId, keyframeId, time)}
        />
      </div>
    );
  }

  return (
    <section className="animation-timeline" aria-label="时间动画轴">
      <header className="animation-timeline__header">
        <div className="animation-timeline__transport" role="group" aria-label="时间轴播放控制">
          <button type="button" aria-label="回到时间轴开头" onClick={() => seek(0)}>
            <RotateCcw aria-hidden="true" size={15} />
          </button>
          <button
            className="animation-timeline__play"
            type="button"
            disabled={!hasPlayableMotion}
            aria-label={playing ? "暂停时间轴" : "播放时间轴"}
            aria-pressed={playing}
            onClick={togglePlayback}
          >
            {playing ? <Pause aria-hidden="true" size={15} /> : <Play aria-hidden="true" size={15} />}
          </button>
          <output aria-label="时间轴当前时间">{formatTime(progress * duration)}</output>
          <span className="animation-timeline__time-divider">/</span>
          <output aria-label="时间轴总时长">{formatTime(duration)}</output>
          <button
            type="button"
            className={cameraPath?.loop ? "is-active" : undefined}
            disabled={!activeCamera}
            aria-label="循环播放"
            aria-pressed={cameraPath?.loop ?? false}
            onClick={() => {
              if (activeCamera && cameraPath) updateCameraMotionPath(activeCamera.id, { loop: !cameraPath.loop });
            }}
          >
            <Repeat2 aria-hidden="true" size={15} />
          </button>
        </div>

        <div className="animation-timeline__edit-actions">
          <button
            type="button"
            disabled={!canRecordObject}
            aria-label={canRecordObject ? "在当前时间记录关键帧" : "选择道具后记录关键帧"}
            onClick={recordCurrentObject}
          >
            <MapPinPlus aria-hidden="true" size={14} />
            <span>记录关键帧</span>
          </button>
          <button
            type="button"
            disabled={!(selectedObjectKeyframe || selectedCameraKeyframeId)}
            aria-label="删除所选关键帧"
            onClick={deleteSelectedKeyframe}
          >
            <Trash2 aria-hidden="true" size={14} />
          </button>
        </div>

        <label className="animation-timeline__zoom">
          <ZoomIn aria-hidden="true" size={14} />
          <input
            aria-label="时间轴缩放"
            type="range"
            min="75"
            max="200"
            step="25"
            value={zoom}
            onChange={(event) => setZoom(Number(event.currentTarget.value))}
          />
        </label>
        <button className="animation-timeline__close" type="button" aria-label="收起时间轴" onClick={onClose}>
          <X aria-hidden="true" size={16} />
        </button>
      </header>

      <div className="animation-timeline__scroll">
        <div className="animation-timeline__rows" style={rowsStyle}>
          <div className="animation-timeline__row animation-timeline__ruler-row">
            <div className="animation-timeline__track-label animation-timeline__track-label--heading">
              <strong>动画轨道</strong>
              <small>{timelineObjects.length + (activeCamera ? 1 : 0)} 个对象</small>
            </div>
            <div className="animation-timeline__ruler">
              {Array.from({ length: RULER_TICK_COUNT + 1 }, (_, index) => {
                const normalized = index / RULER_TICK_COUNT;
                const major = index % 4 === 0;
                return (
                  <span
                    key={index}
                    className={major ? "is-major" : undefined}
                    style={{ left: `${normalized * 100}%` }}
                  >
                    {major ? `${(normalized * duration).toFixed(duration >= 10 ? 0 : 1)}s` : null}
                  </span>
                );
              })}
              <input
                aria-label="时间轴游标"
                type="range"
                min="0"
                max="1"
                step="0.001"
                value={progress}
                onChange={(event) => seek(Number(event.currentTarget.value))}
              />
            </div>
          </div>

          {activeCamera && cameraPath ? (
            <>
              <div className="animation-timeline__row animation-timeline__row--object">
                <div className="animation-timeline__track-label">
                  <button type="button" aria-label="展开或收起机位轨道" onClick={() => toggleTrack(activeCamera.id)}>
                    {expandedTrackIds.has(activeCamera.id)
                      ? <ChevronDown aria-hidden="true" size={14} />
                      : <ChevronRight aria-hidden="true" size={14} />}
                  </button>
                  <Camera aria-hidden="true" size={14} />
                  <strong title={activeCamera.name}>{activeCamera.name}</strong>
                  <small>{cameraPath.keyframes.length}</small>
                </div>
                <TimelineLane
                  activeKeyframeId={selectedCameraKeyframeId}
                  duration={duration}
                  keyframes={cameraPath.keyframes}
                  label="机位轨道"
                  progress={progress}
                  onMoveKeyframe={(keyframeId, time) => {
                    updateCameraMotionKeyframe(activeCamera.id, keyframeId, { time });
                    seek(time);
                  }}
                  onSelectKeyframe={selectCameraKeyframe}
                />
              </div>
              {expandedTrackIds.has(activeCamera.id) ? [
                ["position", "位置"],
                ["target", "注视点"],
                ["fov", "焦距"],
              ].map(([property, label]) => (
                <div className="animation-timeline__row animation-timeline__row--property" key={`${activeCamera.id}-${property}`}>
                  <div className="animation-timeline__track-label animation-timeline__track-label--property">
                    <span>{label}</span>
                  </div>
                  <TimelineLane
                    activeKeyframeId={selectedCameraKeyframeId}
                    duration={duration}
                    keyframes={cameraPath.keyframes}
                    label={`机位${label}轨道`}
                    progress={progress}
                    onMoveKeyframe={(keyframeId, time) => {
                      updateCameraMotionKeyframe(activeCamera.id, keyframeId, { time });
                      seek(time);
                    }}
                    onSelectKeyframe={selectCameraKeyframe}
                  />
                </div>
              )) : null}
            </>
          ) : null}

          {timelineObjects.map((object) => {
            const path = normalizeObjectMotionPath(object.motionPath, object.transform);
            const expanded = expandedTrackIds.has(object.id);
            const Icon = object.kind === "character" ? PersonStanding : Package;
            return (
              <div className="animation-timeline__track" key={object.id}>
                <div className={`animation-timeline__row animation-timeline__row--object${selectedObjectId === object.id ? " is-selected" : ""}`}>
                  <div className="animation-timeline__track-label">
                    <button type="button" aria-label={`展开或收起${object.name}轨道`} onClick={() => toggleTrack(object.id)}>
                      {expanded ? <ChevronDown aria-hidden="true" size={14} /> : <ChevronRight aria-hidden="true" size={14} />}
                    </button>
                    <Icon aria-hidden="true" size={14} />
                    <strong title={object.name}>{object.name}</strong>
                    <small>{path.keyframes.length}</small>
                  </div>
                  <TimelineLane
                    activeKeyframeId={selectedObjectId === object.id ? selectedObjectKeyframeId : null}
                    duration={duration}
                    keyframes={path.keyframes}
                    label={`${object.name}动画轨道`}
                    progress={progress}
                    onMoveKeyframe={(keyframeId, time) => {
                      updateObjectMotionKeyframe(object.id, keyframeId, { time });
                      seek(time);
                    }}
                    onSelectKeyframe={(keyframeId, time) => selectObjectKeyframe(object.id, keyframeId, time)}
                  />
                </div>
                {expanded ? (
                  <>
                    {renderObjectPropertyRows(object.id, path.keyframes, "position", "位置")}
                    {renderObjectPropertyRows(object.id, path.keyframes, "rotation", "旋转")}
                    {renderObjectPropertyRows(object.id, path.keyframes, "scale", "缩放")}
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
