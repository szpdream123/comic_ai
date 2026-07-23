import React, { useCallback, useEffect, useState } from "react";
import { Save } from "lucide-react";
import { CanvasEmptyHint } from "./CanvasEmptyHint.jsx";
import { CanvasFilesPanel } from "./CanvasFilesPanel.jsx";
import { CanvasLogoMenu } from "./CanvasLogoMenu.jsx";
import { CanvasStoryboardPanel } from "./CanvasStoryboardPanel.jsx";
import { CanvasVersionHistoryPanel } from "./CanvasVersionHistoryPanel.jsx";
import { canHandleCanvasMediaInput } from "./canvas-media-input.js";
import { ChatSidebar } from "./ChatSidebar.jsx";
import { EditableProjectName } from "./EditableProjectName.jsx";
import "./loomic-shell.css";

function useControllableState(value, onChange, fallback) {
  const [internal, setInternal] = useState(fallback);
  useEffect(() => {
    if (value !== undefined) setInternal(value);
  }, [value]);
  const current = value === undefined ? internal : value;
  const update = (next) => {
    const resolved = typeof next === "function" ? next(current) : next;
    if (value === undefined) setInternal(resolved);
    onChange?.(resolved);
  };
  return [current, update];
}

export function LoomicCanvasShell({
  canvasSlot,
  api,
  assetClient,
  canvasProjectId,
  saveState = "saved",
  onRetrySave,
  projectName = "未命名项目",
  onProjectNameChange,
  viewMode = "workflow",
  onViewModeChange,
  chatOpen,
  onChatOpenChange,
  layersOpen,
  onLayersOpenChange,
  filesOpen,
  onFilesOpenChange,
  filesDialogRequest,
  onFilesDialogClose,
  historyOpen,
  onHistoryOpenChange,
  versionHistory,
  onRestoreVersion,
  selectedElements = [],
  chatStorageKey = "loomic-canvas-chat",
  onChatSend,
  onLocalChatSend,
  onHome,
  onProjects,
  standaloneMode = false,
  canvasProjects = [],
  currentProjectId,
  canvasProjectsStatus,
  canvasProjectsError,
  onReloadProjects,
  onSelectProject,
  onNewProject,
  onDeleteProject,
  onImportImage,
  onGenerate,
  theme = "light",
  className = "",
}) {
  const [isChatOpen, setChatOpen] = useControllableState(chatOpen, onChatOpenChange, true);
  const [isFilesOpen, setFilesOpen] = useControllableState(filesOpen, onFilesOpenChange, false);
  const [isHistoryOpen, setHistoryOpen] = useControllableState(historyOpen, onHistoryOpenChange, false);
  const [isLayersOpen] = useControllableState(layersOpen, onLayersOpenChange, false);
  const filesDialogOpen = Boolean(filesDialogRequest);
  const [dropActive, setDropActive] = useState(false);
  const importFiles = useCallback(async (files, anchor) => {
    if (typeof onImportImage !== "function") return;
    const candidates = Array.from(files ?? []);
    const supported = candidates.filter((file) => /^(?:image|video|audio)\//.test(file.type));
    if (!supported.length && candidates.length) {
      api?.setToast?.({ message: "仅支持图片、视频或音频文件。", closable: true });
      return;
    }
    for (const [index, file] of supported.entries()) {
      try {
        await onImportImage(file, api, anchor ? {
          anchor: { x: anchor.x + index * 32, y: anchor.y + index * 32 },
        } : undefined);
      } catch (error) {
        api?.setToast?.({ message: error instanceof Error ? error.message : `导入失败：${file.name}`, closable: true });
      }
    }
  }, [api, onImportImage]);
  useEffect(() => {
    const handlePaste = (event) => {
      if (!canHandleCanvasMediaInput(event, { viewMode, kind: "paste" })) return;
      const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
      event.preventDefault();
      void importFiles(files);
    };
    document.addEventListener("paste", handlePaste, true);
    return () => document.removeEventListener("paste", handlePaste, true);
  }, [importFiles, viewMode]);
  useEffect(() => {
    if (viewMode !== "workflow") setDropActive(false);
  }, [viewMode]);
  const handleDragOver = useCallback((event) => {
    if (!canHandleCanvasMediaInput(event, { viewMode, kind: "drag" })) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDropActive(true);
  }, [viewMode]);
  const handleDragLeave = useCallback((event) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setDropActive(false);
  }, []);
  const handleDrop = useCallback((event) => {
    if (!canHandleCanvasMediaInput(event, { viewMode, kind: "drop" })) return;
    event.preventDefault();
    setDropActive(false);
    const bounds = event.currentTarget.querySelector(".loomic-canvas-root")?.getBoundingClientRect();
    const appState = api?.getAppState?.() ?? {};
    const zoom = Number(appState.zoom?.value ?? appState.zoom) || 1;
    const anchor = bounds ? {
      x: (event.clientX - bounds.left) / zoom - (Number(appState.scrollX) || 0),
      y: (event.clientY - bounds.top) / zoom - (Number(appState.scrollY) || 0),
    } : undefined;
    void importFiles(event.dataTransfer?.files, anchor);
  }, [api, importFiles, viewMode]);

  return (
    <main
      className={`lm-canvas-shell ${className}`.trim()}
      data-theme={theme}
      data-view-mode={viewMode}
      data-chat-open={isChatOpen ? "true" : "false"}
      data-files-open={isFilesOpen ? "true" : "false"}
      data-history-open={isHistoryOpen ? "true" : "false"}
      data-layers-open={isLayersOpen ? "true" : "false"}
      data-drop-active={dropActive ? "true" : "false"}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {viewMode === "workflow" && dropActive ? <div className="lm-canvas-drop-overlay" role="status">松开以导入素材</div> : null}
      <section className="lm-canvas-stage">
        <nav className="lm-canvas-topbar" aria-label="项目导航">
          <CanvasLogoMenu
            api={api}
            onHome={onHome}
            onProjects={onProjects}
            standaloneMode={standaloneMode}
            canvasProjects={canvasProjects}
            currentProjectId={currentProjectId}
            canvasProjectsStatus={canvasProjectsStatus}
            canvasProjectsError={canvasProjectsError}
            onReloadProjects={onReloadProjects}
            onSelectProject={onSelectProject}
            onNewProject={onNewProject}
            onDeleteProject={onDeleteProject}
            onImportImage={onImportImage}
            onOpenHistory={() => setHistoryOpen(true)}
          />
          <EditableProjectName name={projectName} onChange={onProjectNameChange} />
          {saveState === "error" && onRetrySave ? <button type="button" className={`lm-canvas-save-state is-${saveState}`} onClick={onRetrySave} aria-label="重试保存" title="重试保存">
            <Save aria-hidden="true" />
            保存失败，点击重试
          </button> : <span className={`lm-canvas-save-state is-${saveState}`} role="status" aria-live="polite">
            <Save aria-hidden="true" />
            {saveState === "saving" || saveState === "dirty"
              ? "保存中"
              : saveState === "loading"
                ? "正在检查保存状态"
              : saveState === "retrying"
                ? "未同步，正在重试"
                : saveState === "conflict"
                  ? "存在保存冲突"
                  : saveState === "local"
                    ? "已保存到本机"
                    : saveState === "error"
                      ? "保存失败"
                      : "已保存"}
          </span>}
          <div className="lm-canvas-view-tabs" role="tablist" aria-label="画布视图">
            <button type="button" role="tab" aria-selected={viewMode === "workflow"} className={viewMode === "workflow" ? "is-active" : ""} onClick={() => onViewModeChange?.("workflow")}>工作流</button>
            <button type="button" role="tab" aria-selected={viewMode === "storyboard"} className={viewMode === "storyboard" ? "is-active" : ""} onClick={() => onViewModeChange?.("storyboard")}>故事板</button>
          </div>
        </nav>

        <div className="lm-canvas-slot">{canvasSlot}</div>
        {viewMode === "workflow" ? <CanvasEmptyHint api={api} onOpenChat={() => setChatOpen(true)} /> : null}
        {viewMode === "storyboard" ? <CanvasStoryboardPanel api={api} onOpenWorkflow={() => onViewModeChange?.("workflow")} onGenerate={onGenerate} /> : null}
        <CanvasFilesPanel
          api={api}
          assetClient={assetClient}
          canvasProjectId={canvasProjectId}
          onGenerate={onGenerate}
          onImportImage={onImportImage}
          open={isFilesOpen || filesDialogOpen}
          onClose={() => filesDialogOpen ? onFilesDialogClose?.() : setFilesOpen(false)}
          viewRequest={filesDialogRequest}
          presentation={filesDialogOpen ? "dialog" : "panel"}
        />
        <CanvasVersionHistoryPanel
          history={versionHistory}
          open={isHistoryOpen}
          onClose={() => setHistoryOpen(false)}
          onRestore={onRestoreVersion}
        />

        <a
          className="lm-deerflow-signature"
          href="https://deerflow.tech"
          target="_blank"
          rel="noreferrer"
        >
          由鹿流创建
        </a>
      </section>

      <ChatSidebar
        open={isChatOpen}
        onOpenChange={setChatOpen}
        selectedElements={selectedElements}
        storageKey={chatStorageKey}
        onSend={onChatSend ?? onLocalChatSend}
      />
    </main>
  );
}
