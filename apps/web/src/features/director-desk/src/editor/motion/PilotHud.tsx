import { CornerDownLeft, Crosshair, LogOut, Video } from "lucide-react";
import type { CameraPilotMode } from "../store/directorStore";
import { useDirectorStore } from "../store/directorStore";

function formatShotSeconds(seconds: number) {
  return `${seconds.toFixed(2).replace(/0$/, "")}s`;
}

export function PilotHud({
  lockedTargetName,
  onExit,
  onRecord,
  pointedTargetName,
}: {
  lockedTargetName: string | null;
  mode: Exclude<CameraPilotMode, "idle">;
  onExit: () => void;
  onRecord: () => void;
  pointedTargetName: string | null;
}) {
  const activeCamera = useDirectorStore((state) =>
    state.project.cameras.find((camera) => camera.id === state.project.activeCameraId) ?? state.project.cameras[0]
  );
  const selectedCameraKeyframeId = useDirectorStore((state) => state.selectedCameraKeyframeId);
  const cameraMotionProgress = useDirectorStore((state) => state.cameraMotionProgress);
  const targetName = lockedTargetName ?? pointedTargetName;
  const keyframes = activeCamera?.motionPath?.keyframes ?? [];
  const activeKeyframeIndex = selectedCameraKeyframeId
    ? keyframes.findIndex((keyframe) => keyframe.id === selectedCameraKeyframeId)
    : keyframes.reduce((nearestIndex, keyframe, index) => {
        const nearestDistance = Math.abs(keyframes[nearestIndex]?.time - cameraMotionProgress);
        const currentDistance = Math.abs(keyframe.time - cameraMotionProgress);
        return currentDistance < nearestDistance ? index : nearestIndex;
      }, 0);
  const crosshairLabel = lockedTargetName
    ? `掌镜准星，已锁定${lockedTargetName}`
    : pointedTargetName
      ? `掌镜准星，当前对准${pointedTargetName}`
      : "掌镜准星，当前没有对准可锁定物体";

  return (
    <div className="pilot-hud" aria-label="第一人称掌镜控制层">
      <div className="pilot-status" role="status">
        <span className="pilot-status-dot" />
        掌镜模式
      </div>

      <section className="pilot-shot-panel" aria-label="已添加镜头">
        <header className="pilot-shot-panel-header">
          <div>
            <strong>已添加镜头</strong>
            <small>{activeCamera?.name ?? "未创建镜头"} · {keyframes.length} 个</small>
          </div>
          <Video aria-hidden="true" size={15} />
        </header>
        {keyframes.length > 0 ? (
          <ol className="pilot-shot-list" aria-label="已添加镜头列表">
            {keyframes.map((keyframe, index) => (
              <li className={index === activeKeyframeIndex ? "is-current" : undefined} key={keyframe.id}>
                <span>镜头 {index + 1}</span>
                <small>{formatShotSeconds(keyframe.time * (activeCamera?.motionPath?.duration ?? 6))}</small>
              </li>
            ))}
          </ol>
        ) : (
          <p className="pilot-shot-empty">按 Enter 添加镜头</p>
        )}
      </section>

      <div className={`pilot-crosshair${lockedTargetName ? " is-locked" : targetName ? " is-pointing" : ""}`} aria-label={crosshairLabel}>
        <span className="pilot-crosshair-line is-top" />
        <span className="pilot-crosshair-line is-right" />
        <span className="pilot-crosshair-line is-bottom" />
        <span className="pilot-crosshair-line is-left" />
        <span className="pilot-crosshair-center" />
        {targetName ? (
          <span className="pilot-target-name">
            <Crosshair aria-hidden="true" size={13} />
            {lockedTargetName ? `已锁定：${targetName}` : `${targetName} · 按 F 锁定`}
          </span>
        ) : null}
      </div>

      <div className="pilot-keyboard-help" aria-label="掌镜快捷键">
        <span><kbd>按住鼠标拖动</kbd> 上下左右转动</span>
        <span><kbd>W A S D</kbd> 移动</span>
        <span><kbd>E</kbd> 上升 · <kbd>Q</kbd> 下降</span>
        <span><kbd>空格</kbd> 播放/暂停</span>
        <span><kbd>F</kbd> 锁定主体</span>
        <span><kbd>滚轮</kbd> 调整远近</span>
      </div>

      <div className="pilot-touch-help" aria-label="掌镜触控手势">
        <span>单指拖动转向</span>
        <span>双指捏合调焦</span>
      </div>

      <div className="pilot-hud-actions">
        <button type="button" className="pilot-hud-secondary" onClick={onExit} aria-label="退出掌镜模式">
          <LogOut aria-hidden="true" size={15} />
          <span><span className="pilot-hud-shortcut-label">Esc </span>退出</span>
        </button>
        <button type="button" className="pilot-hud-primary" onClick={onRecord} aria-label="记录当前轨迹点">
          <CornerDownLeft aria-hidden="true" size={15} />
          <span><span className="pilot-hud-shortcut-label">Enter </span>记录轨迹点</span>
        </button>
      </div>
    </div>
  );
}
