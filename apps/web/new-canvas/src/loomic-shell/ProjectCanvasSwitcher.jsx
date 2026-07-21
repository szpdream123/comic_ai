import React, { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Layers3,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

export function ProjectCanvasSwitcher({
  canvases = [],
  currentCanvasId,
  status = "idle",
  error = "",
  busy = false,
  onReload,
  onSelect,
  onCreate,
  onOpenNewWindow,
  onRename,
  onCopy,
  onDelete,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const current = canvases.find((canvas) => canvas.id === currentCanvasId) ?? null;

  useEffect(() => {
    if (!open) return undefined;
    const dismiss = (event) => {
      if (event.key === "Escape" || (event.type === "pointerdown" && !rootRef.current?.contains(event.target))) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismiss);
    };
  }, [open]);

  const invoke = async (callback, canvas) => {
    const completed = await callback?.(canvas);
    if (completed !== false) {
      setOpen(false);
    }
  };

  return (
    <div className="lm-project-canvas-switcher" ref={rootRef}>
      <button
        type="button"
        className="lm-project-canvas-trigger"
        aria-label="切换画布"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={status === "loading" && !current}
        onClick={() => setOpen((value) => !value)}
      >
        {status === "loading" && !current
          ? <LoaderCircle className="is-spinning" aria-hidden="true" />
          : <Layers3 aria-hidden="true" />}
        <span title={current?.title}>{current?.title || "选择画布"}</span>
        <ChevronDown aria-hidden="true" />
      </button>

      {open ? (
        <div className="lm-project-canvas-popover" role="menu" aria-label="项目画布">
          <header>
            <strong>项目画布</strong>
            <button type="button" disabled={busy || !onCreate} onClick={() => invoke(onCreate)} aria-label="新建画布" title="新建画布">
              <Plus aria-hidden="true" />
            </button>
          </header>
          {error ? (
            <div className="lm-project-canvas-state is-error" role="alert">
              <span>{error}</span>
              <button type="button" disabled={!onReload} onClick={() => onReload?.()} aria-label="重新加载画布">
                <RefreshCw aria-hidden="true" />
              </button>
            </div>
          ) : null}
          {!error && status === "loading" ? (
            <div className="lm-project-canvas-state" role="status"><LoaderCircle className="is-spinning" aria-hidden="true" />正在加载画布</div>
          ) : null}
          {!error && status === "ready" && canvases.length === 0 ? (
            <div className="lm-project-canvas-state">暂无可用画布</div>
          ) : null}
          <div className="lm-project-canvas-list">
            {canvases.map((canvas) => {
              const selected = canvas.id === currentCanvasId;
              return (
                <div className={`lm-project-canvas-item${selected ? " is-current" : ""}`} key={canvas.id}>
                  <button
                    type="button"
                    role="menuitem"
                    aria-current={selected ? "page" : undefined}
                    disabled={busy || selected || !onSelect}
                    onClick={() => invoke(onSelect, canvas)}
                  >
                    <span title={canvas.title}>{canvas.title}</span>
                    {selected ? <Check aria-label="当前画布" /> : null}
                  </button>
                  <div className="lm-project-canvas-actions" aria-label={`${canvas.title}操作`}>
                    <button type="button" aria-label={`${canvas.title}新窗口打开`} title="新窗口打开" disabled={busy} onClick={() => invoke(onOpenNewWindow, canvas)}><ExternalLink aria-hidden="true" /></button>
                    <button type="button" aria-label={`${canvas.title}重命名`} title="重命名" disabled={busy} onClick={() => invoke(onRename, canvas)}><Pencil aria-hidden="true" /></button>
                    <button type="button" aria-label={`${canvas.title}复制画布`} title="复制画布" disabled={busy} onClick={() => invoke(onCopy, canvas)}><Copy aria-hidden="true" /></button>
                    <button type="button" className="is-destructive" aria-label={`${canvas.title}删除画布`} title="删除画布" disabled={busy} onClick={() => invoke(onDelete, canvas)}><Trash2 aria-hidden="true" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
