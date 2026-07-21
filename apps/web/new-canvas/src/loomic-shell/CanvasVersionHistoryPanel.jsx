import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, Clock3, LoaderCircle, RotateCcw, X } from "lucide-react";
import { createCanvasMinimapModel } from "../loomic-core/canvas-minimap.js";

const PREVIEW_WIDTH = 184;
const PREVIEW_HEIGHT = 108;

function formatSavedAt(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "未知时间";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function previewClass(type) {
  if (type === "image" || type === "image-generator") return "is-image";
  if (type === "embeddable" || type === "video-generator") return "is-video";
  if (type === "text" || type === "text-node") return "is-text";
  return "is-shape";
}

function VersionPreview({ entry }) {
  const content = entry?.content ?? { elements: [], appState: {} };
  const model = useMemo(() => createCanvasMinimapModel(content.elements, content.appState, {
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    padding: 9,
  }), [content]);
  return (
    <svg className="lm-version-preview" viewBox={`0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}`} role="img" aria-label="版本画布预览">
      {model.nodes.map((node) => <rect key={node.id} className={`lm-version-preview-node ${previewClass(node.type)}`} {...node.rect} rx="1.5" />)}
    </svg>
  );
}

export function CanvasVersionHistoryPanel({ history, open, onClose, onRestore }) {
  const [status, setStatus] = useState("idle");
  const [entries, setEntries] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [error, setError] = useState("");
  const [confirmingId, setConfirmingId] = useState("");
  const [restoringId, setRestoringId] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const requestRef = useRef(0);
  const nextCursorRef = useRef(null);

  const loadEntries = useCallback(async ({ append = false } = {}) => {
    if (!history?.listHistory) return;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setStatus(append ? "loading-more" : "loading");
    setError("");
    try {
      const result = await history.listHistory(append ? { cursor: nextCursorRef.current, limit: 25 } : { limit: 25 });
      const nextEntries = Array.isArray(result) ? result : result?.entries;
      if (requestRef.current !== requestId) return;
      const normalizedEntries = Array.isArray(nextEntries) ? nextEntries : [];
      setEntries((current) => {
        const combined = append ? [...current, ...normalizedEntries] : normalizedEntries;
        const unique = Array.from(new Map(combined.map((entry) => [entry.id, entry])).values());
        return unique.sort((left, right) => Date.parse(right?.savedAt ?? "") - Date.parse(left?.savedAt ?? ""));
      });
      const resolvedCursor = Array.isArray(result) ? null : result?.nextCursor ?? null;
      nextCursorRef.current = resolvedCursor;
      setHasMore(Boolean(!Array.isArray(result) && result?.hasMore));
      setSelectedId((current) => append
        ? current || normalizedEntries[0]?.id || ""
        : normalizedEntries.some((entry) => entry.id === current) ? current : normalizedEntries[0]?.id || "");
      setStatus("ready");
    } catch {
      if (requestRef.current !== requestId) return;
      setError("版本历史读取失败。");
      setStatus("error");
    }
  }, [history]);

  useEffect(() => {
    if (!open) return undefined;
    nextCursorRef.current = null;
    setHasMore(false);
    void loadEntries();
    const unsubscribe = history?.subscribeHistory?.(() => { nextCursorRef.current = null; setHasMore(false); void loadEntries(); });
    return () => {
      requestRef.current += 1;
      unsubscribe?.();
    };
  }, [history, loadEntries, open]);

  useEffect(() => {
    if (!open || !selectedId || !history?.getHistoryEntry) {
      setSelectedEntry(null);
      return undefined;
    }
    let active = true;
    setSelectedEntry(null);
    Promise.resolve(history.getHistoryEntry(selectedId))
      .then((entry) => { if (active) setSelectedEntry(entry); })
      .catch(() => { if (active) setError("版本预览读取失败。"); });
    return () => { active = false; };
  }, [history, open, selectedId]);

  const restore = useCallback(async (entryId) => {
    if (!entryId || restoringId) return;
    if (confirmingId !== entryId) {
      setConfirmingId(entryId);
      return;
    }
    setRestoringId(entryId);
    setError("");
    try {
      await onRestore?.(entryId);
      setConfirmingId("");
      await loadEntries();
    } catch (restoreError) {
      setError(restoreError?.message || "版本恢复失败，当前画布未变更。");
    } finally {
      setRestoringId("");
    }
  }, [confirmingId, loadEntries, onRestore, restoringId]);

  if (!open) return null;
  return (
    <aside className="lm-version-panel" aria-label="画布版本历史" onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
      <header className="lm-panel-header">
        <div><h2>版本历史</h2><span>{entries.length} 个版本</span></div>
        <button type="button" className="lm-icon-button" aria-label="关闭版本历史" onClick={onClose}><X aria-hidden="true" /></button>
      </header>
      {error ? <div className="lm-panel-warning"><AlertCircle aria-hidden="true" /><span>{error}</span></div> : null}
      {status === "loading" ? <p className="lm-panel-status"><LoaderCircle className="is-spinning" aria-hidden="true" />正在读取版本…</p> : null}
      {status === "ready" && !entries.length ? <p className="lm-panel-empty">暂无已保存版本</p> : null}
      {entries.length ? (
        <div className="lm-version-body">
          <div className="lm-version-list" role="listbox" aria-label="已保存版本">
            {entries.map((entry, index) => (
              <button key={entry.id} type="button" role="option" aria-selected={selectedId === entry.id} className={selectedId === entry.id ? "is-selected" : ""} onClick={() => { setSelectedId(entry.id); setConfirmingId(""); }}>
                <Clock3 aria-hidden="true" />
                <span><strong>{index === 0 ? "最近保存" : formatSavedAt(entry.savedAt)}</strong><small>{entry.source === "cloud" && entry.serverRevision ? `云端版本 ${entry.serverRevision}` : entry.source === "conflict" ? "冲突前草稿" : "本地版本"}</small></span>
                <small>{entry.summary?.nodeCount ?? 0} 节点</small>
              </button>
            ))}
            {hasMore ? <button className="lm-version-load-more" type="button" disabled={status === "loading-more"} onClick={() => { void loadEntries({ append: true }); }}>
              {status === "loading-more" ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : null}
              {status === "loading-more" ? "正在读取更多" : "加载更多版本"}
            </button> : null}
          </div>
          <section className="lm-version-detail" aria-label="版本预览">
            {selectedEntry ? (
              <>
                <VersionPreview entry={selectedEntry} />
                <dl>
                  <div><dt>保存时间</dt><dd>{formatSavedAt(selectedEntry.savedAt)}</dd></div>
                  <div><dt>内容</dt><dd>{selectedEntry.summary?.nodeCount ?? 0} 节点 · {selectedEntry.summary?.edgeCount ?? 0} 连线 · {selectedEntry.summary?.mediaCount ?? 0} 媒体</dd></div>
                </dl>
                <button className={`lm-version-restore ${confirmingId === selectedEntry.id ? "is-confirming" : ""}`} type="button" disabled={Boolean(restoringId) || !onRestore} onClick={() => restore(selectedEntry.id)}>
                  {restoringId === selectedEntry.id ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : confirmingId === selectedEntry.id ? <Check aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
                  {restoringId === selectedEntry.id ? "正在恢复" : confirmingId === selectedEntry.id ? "确认恢复" : "恢复此版本"}
                </button>
              </>
            ) : null}
          </section>
        </div>
      ) : null}
    </aside>
  );
}
