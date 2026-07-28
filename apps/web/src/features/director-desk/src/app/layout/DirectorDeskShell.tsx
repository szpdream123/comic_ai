import { useEffect, useState, type ReactNode } from "react";
import { PanelLeft, SlidersHorizontal, X } from "lucide-react";
import { ObjectTreePanel } from "../../editor/panels/ObjectTreePanel";
import { RightPanel } from "../../editor/panels/RightPanel";
import { useDirectorStore } from "../../editor/store/directorStore";

export function DirectorDeskShell({ children }: { children: ReactNode }) {
  const [mobilePanel, setMobilePanel] = useState<"scene" | "properties" | null>(null);
  const viewportPanelsCollapsed = useDirectorStore((state) => state.viewportPanelsCollapsed);
  const motionStudioOpen = useDirectorStore((state) => state.motionStudioOpen);
  const cameraPilotMode = useDirectorStore((state) => state.cameraPilotMode);
  const cameraMotionPlaying = useDirectorStore((state) => state.cameraMotionPlaying);
  const viewMode = useDirectorStore((state) => state.viewMode);
  const hasCameraPreviewPath = useDirectorStore((state) => {
    const activeCamera = state.project.cameras.find((camera) => camera.id === state.project.activeCameraId)
      ?? state.project.cameras[0];
    return (activeCamera?.motionPath?.keyframes.length ?? 0) >= 2;
  });
  const isCameraPiloting = cameraPilotMode !== "idle";
  const isCameraTrackPlaying = isCameraPiloting && cameraMotionPlaying && hasCameraPreviewPath;
  const isCameraPreviewing =
    motionStudioOpen && viewMode === "camera" && hasCameraPreviewPath && !isCameraPiloting;

  useEffect(() => {
    if (mobilePanel && (motionStudioOpen || isCameraPiloting || isCameraPreviewing)) setMobilePanel(null);
  }, [isCameraPiloting, isCameraPreviewing, mobilePanel, motionStudioOpen]);

  useEffect(() => {
    if (!mobilePanel) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobilePanel(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobilePanel]);

  const scenePanelHidden = mobilePanel === "properties" || (viewportPanelsCollapsed && mobilePanel !== "scene");
  const propertiesPanelHidden = mobilePanel === "scene" || (viewportPanelsCollapsed && mobilePanel !== "properties");

  return (
    <div
      className={[
        "director-shell director-shell-fullbleed",
        viewportPanelsCollapsed ? "is-sidebars-collapsed" : "",
        motionStudioOpen && (!isCameraPiloting || isCameraTrackPlaying) && !isCameraPreviewing ? "is-motion-studio-open" : "",
        isCameraPiloting ? "is-camera-piloting" : "",
        isCameraTrackPlaying ? "is-camera-track-playing" : "",
        isCameraPreviewing ? "is-camera-previewing" : "",
      ].filter(Boolean).join(" ")}
    >
      <section className="viewport-column" aria-label="3D视口">
        {children}
        {!motionStudioOpen && !isCameraPiloting && !isCameraPreviewing ? (
        <div className="director-mobile-panel-actions" role="group" aria-label="移动端面板">
          <button
            type="button"
            aria-controls="director-mobile-scene-panel"
            aria-expanded={mobilePanel === "scene"}
            aria-label="打开场景面板"
            title="场景"
            onClick={() => setMobilePanel((panel) => panel === "scene" ? null : "scene")}
          >
            <PanelLeft aria-hidden="true" size={18} />
          </button>
          <button
            type="button"
            aria-controls="director-mobile-properties-panel"
            aria-expanded={mobilePanel === "properties"}
            aria-label="打开属性面板"
            title="属性"
            onClick={() => setMobilePanel((panel) => panel === "properties" ? null : "properties")}
          >
            <SlidersHorizontal aria-hidden="true" size={18} />
          </button>
        </div>
        ) : null}
      </section>
      {mobilePanel ? (
        <button
          type="button"
          className="director-mobile-panel-backdrop"
          aria-label="关闭移动端面板"
          onClick={() => setMobilePanel(null)}
        />
      ) : null}
      <aside
        id="director-mobile-scene-panel"
        className={`left-sidebar director-sidebar${mobilePanel === "scene" ? " is-mobile-open" : ""}`}
        aria-hidden={scenePanelHidden ? "true" : undefined}
        aria-label="场景"
      >
        <button
          type="button"
          className="director-mobile-panel-close"
          aria-label="关闭场景面板"
          onClick={() => setMobilePanel(null)}
        >
          <X aria-hidden="true" size={18} />
        </button>
        <ObjectTreePanel />
      </aside>
      <aside
        id="director-mobile-properties-panel"
        className={`right-sidebar director-sidebar${mobilePanel === "properties" ? " is-mobile-open" : ""}`}
        aria-hidden={propertiesPanelHidden ? "true" : undefined}
        aria-label="属性"
      >
        <button
          type="button"
          className="director-mobile-panel-close"
          aria-label="关闭属性面板"
          onClick={() => setMobilePanel(null)}
        >
          <X aria-hidden="true" size={18} />
        </button>
        <RightPanel />
      </aside>
    </div>
  );
}
