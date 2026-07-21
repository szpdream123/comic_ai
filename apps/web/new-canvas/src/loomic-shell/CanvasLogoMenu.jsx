import React, { useEffect, useRef, useState } from "react";
import {
  Check,
  ClipboardCopy,
  ClipboardPaste,
  Copy,
  Download,
  FolderOpen,
  Home,
  History,
  Upload,
  Layers3,
  LoaderCircle,
  Maximize2,
  Plus,
  Redo2,
  RefreshCw,
  Trash2,
  Undo2,
} from "lucide-react";
import { LoomicLogo } from "./LoomicLogo.jsx";
import { dispatchKeyToCanvas, duplicateSelectedElements, importImageToCanvas } from "./canvasApi.js";
import { CANVAS_EXPORT_EMPTY, downloadCanvasImageBlob, exportCanvasImage } from "../loomic-core/canvas-export.js";

function MenuItem({ icon: Icon, children, shortcut, destructive = false, disabled = false, onClick }) {
  return (
    <button
      className={`lm-menu-item${destructive ? " is-destructive" : ""}`}
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
      <span>{children}</span>
      {shortcut ? <kbd>{shortcut}</kbd> : null}
    </button>
  );
}

export function CanvasLogoMenu({
  api,
  onHome,
  onProjects,
  standaloneMode = false,
  canvasProjects = [],
  currentProjectId,
  canvasProjectsStatus = "idle",
  canvasProjectsError,
  onReloadProjects,
  onSelectProject,
  onNewProject,
  onDeleteProject,
  onImportImage,
  onOpenHistory,
}) {
  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const rootRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const dismiss = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        setConfirmingDelete(false);
      } else if (event.type === "pointerdown" && !rootRef.current?.contains(event.target)) {
        setOpen(false);
        setConfirmingDelete(false);
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismiss);
    };
  }, [open]);

  const closeAfter = (callback) => async () => {
    await callback?.();
    setOpen(false);
    setConfirmingDelete(false);
  };

  const handleDelete = async () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    await onDeleteProject?.();
    setOpen(false);
    setConfirmingDelete(false);
  };

  const handleFile = async (event) => {
    const files = Array.from(event.target.files ?? []).filter((file) => /^(?:image|video|audio)\//.test(file.type));
    event.target.value = "";
    if (!files.length) return;
    for (const file of files) {
      if (onImportImage) await onImportImage(file, api);
      else if (file.type.startsWith("image/")) await importImageToCanvas(api, file);
    }
    setOpen(false);
  };

  const handleExport = async () => {
    try {
      const blob = await exportCanvasImage(api);
      downloadCanvasImageBlob(blob);
      setOpen(false);
      setConfirmingDelete(false);
    } catch (error) {
      api?.setToast?.({
        message: error?.code === CANVAS_EXPORT_EMPTY
          ? "画布中暂无可导出的内容。"
          : "导出图片失败，请稍后重试。",
        closable: true,
      });
    }
  };

  return (
    <div className="lm-logo-menu" ref={rootRef}>
      <button
        type="button"
        className="lm-logo-trigger"
        aria-label="画布菜单"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          setOpen((value) => !value);
          setConfirmingDelete(false);
        }}
      >
        <LoomicLogo className="lm-logo" />
      </button>

      {open ? (
        <div className="lm-menu-popover" role="menu">
          <div className="lm-menu-group">
            <MenuItem icon={Home} disabled={!onHome} onClick={closeAfter(onHome)}>主页</MenuItem>
            <MenuItem icon={FolderOpen} disabled={!onProjects} onClick={closeAfter(onProjects)}>项目库</MenuItem>
          </div>
          {standaloneMode ? (
            <>
              <div className="lm-menu-separator" />
              <div className="lm-menu-projects" aria-label="画布列表">
                <div className="lm-menu-heading">画布</div>
                {canvasProjectsStatus === "loading" ? (
                  <div className="lm-menu-project-state" role="status">
                    <LoaderCircle className="is-spinning" size={15} aria-hidden="true" />
                    <span>正在加载画布</span>
                  </div>
                ) : null}
                {canvasProjectsStatus === "error" ? (
                  <div className="lm-menu-project-state is-error" role="alert">
                    <span>{canvasProjectsError || "画布列表加载失败"}</span>
                    <button type="button" onClick={() => onReloadProjects?.()} aria-label="重新加载画布列表">
                      <RefreshCw size={14} aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
                {canvasProjectsStatus === "ready" && canvasProjects.length === 0 ? (
                  <div className="lm-menu-project-state">
                    <Layers3 size={15} aria-hidden="true" />
                    <span>暂无画布</span>
                  </div>
                ) : null}
                {canvasProjectsStatus === "ready" ? canvasProjects.map((project) => {
                  const current = project.id === currentProjectId;
                  return (
                    <button
                      className={`lm-menu-project${current ? " is-current" : ""}`}
                      type="button"
                      role="menuitem"
                      aria-current={current ? "page" : undefined}
                      disabled={current || !onSelectProject}
                      key={project.id}
                      onClick={closeAfter(() => onSelectProject?.(project.id))}
                    >
                      <Layers3 size={15} aria-hidden="true" />
                      <span title={project.title}>{project.title}</span>
                      {current ? <Check size={14} aria-label="当前画布" /> : null}
                    </button>
                  );
                }) : null}
              </div>
              <div className="lm-menu-separator" />
              <div className="lm-menu-group">
                <MenuItem icon={Plus} disabled={!onNewProject} onClick={closeAfter(onNewProject)}>新建画布</MenuItem>
                {onDeleteProject ? (
                  <MenuItem icon={Trash2} destructive onClick={handleDelete}>
                    {confirmingDelete ? "再次点击确认删除" : "删除当前画布"}
                  </MenuItem>
                ) : null}
              </div>
            </>
          ) : null}
          <div className="lm-menu-separator" />
          <div className="lm-menu-group">
            <MenuItem icon={Upload} disabled={!api && !onImportImage} onClick={() => fileInputRef.current?.click()}>导入素材</MenuItem>
            <MenuItem icon={Download} disabled={!api} onClick={handleExport}>导出图片</MenuItem>
            {onOpenHistory ? <MenuItem icon={History} onClick={closeAfter(onOpenHistory)}>版本历史</MenuItem> : null}
          </div>
          <div className="lm-menu-separator" />
          <div className="lm-menu-group">
            <MenuItem icon={Undo2} disabled={!api} shortcut="Ctrl Z" onClick={closeAfter(() => dispatchKeyToCanvas("z", { metaKey: true }))}>撤销</MenuItem>
            <MenuItem icon={Redo2} disabled={!api} shortcut="Shift Ctrl Z" onClick={closeAfter(() => dispatchKeyToCanvas("z", { metaKey: true, shiftKey: true }))}>重做</MenuItem>
            <MenuItem icon={ClipboardCopy} disabled={!api} shortcut="Ctrl C" onClick={closeAfter(() => dispatchKeyToCanvas("c", { metaKey: true }))}>复制对象</MenuItem>
            <MenuItem icon={ClipboardPaste} disabled={!api} shortcut="Ctrl V" onClick={closeAfter(() => dispatchKeyToCanvas("v", { metaKey: true }))}>粘贴对象</MenuItem>
            <MenuItem icon={Copy} disabled={!api} shortcut="Ctrl D" onClick={closeAfter(() => duplicateSelectedElements(api))}>快速复制对象</MenuItem>
          </div>
          <div className="lm-menu-separator" />
          <div className="lm-menu-group">
            <MenuItem icon={Maximize2} disabled={!api} onClick={closeAfter(() => api?.scrollToContent?.())}>显示画布所有元素</MenuItem>
          </div>
        </div>
      ) : null}

      <input ref={fileInputRef} type="file" accept="image/*,video/*,audio/*" multiple hidden onChange={handleFile} />
    </div>
  );
}
