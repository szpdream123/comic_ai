import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, AudioLines, ChevronDown, ChevronRight, Film, GripVertical, Image, LoaderCircle, LocateFixed, MapPin, Package, RefreshCw, RotateCw, Save, Sparkles, UserRound } from "lucide-react";
import { buildCanvasNodeGenerationRequest, executeCanvasNodeGeneration } from "../loomic-core/canvas-generation-execution.js";
import { useCanvasGenerationConfig } from "../loomic-core/CanvasGenerationConfigContext.jsx";
import {
  applyCanvasStoryboardOrder,
  buildCanvasStoryboardKeyElements,
  buildCanvasStoryboardItems,
  filterCanvasStoryboardItems,
  moveCanvasStoryboardId,
  reorderCanvasStoryboardIds,
  resolveCanvasStoryboardGenerationState,
  updateCanvasStoryboardKeyElement,
} from "./canvas-storyboard.js";
import "./canvas-storyboard.css";

function StoryboardPreview({ item }) {
  if (item.mediaKind === "text") {
    return <div className="lm-storyboard-text"><span>文本</span><p>{item.title}</p></div>;
  }
  if (!item.mediaUrl) {
    return <div className="lm-storyboard-placeholder">{item.mediaKind === "video" ? <Film aria-hidden="true" /> : <Image aria-hidden="true" />}<span>等待产物</span></div>;
  }
  if (item.mediaKind === "video") {
    return <video src={item.mediaUrl} muted playsInline preload="metadata" />;
  }
  if (item.mediaKind === "audio") {
    return <div className="lm-storyboard-audio"><AudioLines aria-hidden="true" /><audio controls preload="metadata" src={item.mediaUrl} /></div>;
  }
  return <img src={item.mediaUrl} alt="" draggable={false} />;
}

const FILTERS = [
  { value: "all", label: "全部" },
  { value: "text", label: "文本" },
  { value: "image", label: "图片" },
  { value: "video", label: "视频" },
  { value: "audio", label: "音频" },
  { value: "pending", label: "待生成" },
];

const KEY_ELEMENT_LABELS = { character: "角色", scene: "场景", prop: "道具" };
const KEY_ELEMENT_ICONS = { character: UserRound, scene: MapPin, prop: Package };

function GeneratorMetadata({ item }) {
  if (!item.isGenerator && !item.references?.length) return null;
  const format = item.mediaKind === "video"
    ? `${item.aspectRatio} · ${item.duration} 秒 · ${item.resolution}`
    : `${item.aspectRatio} · ${item.quality}`;
  return (
    <>
      {item.isGenerator ? <div className="lm-storyboard-generator-meta"><span>{item.model}</span><span>{format}</span><span>{item.referenceImageCount} 张参考图</span></div> : null}
      {item.references?.length ? <div className="lm-storyboard-reference-meta"><span>引用</span>{item.references.map((reference) => <span key={reference.id} title={`${reference.title} · ${reference.portKind || "输入"}`}>{reference.title}</span>)}</div> : null}
      {item.error ? <p className="lm-storyboard-error" role="alert">{item.error}</p> : null}
    </>
  );
}

export function CanvasStoryboardPanel({ api, onOpenWorkflow, onGenerate }) {
  const generationConfig = useCanvasGenerationConfig();
  const [revision, setRevision] = useState(0);
  const [draggingId, setDraggingId] = useState("");
  const [filter, setFilter] = useState("all");
  const [keyElementsOpen, setKeyElementsOpen] = useState(true);
  const [editingKeyElement, setEditingKeyElement] = useState(null);
  const [generationState, setGenerationState] = useState({ id: "", running: false, error: "" });
  const elements = api?.getSceneElements?.() ?? [];
  const files = api?.getFiles?.() ?? {};
  const items = useMemo(
    () => buildCanvasStoryboardItems(elements, files),
    [elements, files, revision],
  );
  const keyElements = useMemo(
    () => buildCanvasStoryboardKeyElements(elements, files),
    [elements, files, revision],
  );
  const visibleItems = useMemo(() => filterCanvasStoryboardItems(items, filter), [filter, items]);
  const readyCount = items.filter((item) => item.mediaUrl).length;

  const commitOrder = (orderedIds) => {
    const current = api?.getSceneElements?.() ?? [];
    const next = applyCanvasStoryboardOrder(current, orderedIds);
    if (next !== current) api.updateScene?.({ elements: next, captureUpdate: "IMMEDIATELY" });
    setRevision((value) => value + 1);
  };

  const locate = (item) => {
    onOpenWorkflow?.();
    window.requestAnimationFrame(() => {
      const target = api?.getSceneElements?.().find((element) => element.id === item.id);
      if (!target) return;
      api.updateScene?.({ appState: { selectedElementIds: { [target.id]: true } }, captureUpdate: "NONE" });
      api.scrollToContent?.(target, { fitToContent: false, animate: true, duration: 240 });
    });
  };

  const saveKeyElement = () => {
    if (!editingKeyElement) return;
    const current = api?.getSceneElements?.() ?? [];
    const next = updateCanvasStoryboardKeyElement(current, editingKeyElement.id, editingKeyElement);
    if (next !== current) api.updateScene?.({ elements: next, captureUpdate: "IMMEDIATELY" });
    setEditingKeyElement(null);
    setRevision((value) => value + 1);
  };

  const generate = async (item) => {
    const request = buildCanvasNodeGenerationRequest(item.element);
    if (!request || !onGenerate || generationState.running) return;
    try {
      await executeCanvasNodeGeneration({ api, request, onGenerate, onStateChange: setGenerationState, generationConfig });
    } catch {
      // The shared helper writes the failure back to the node for display and persistence.
    } finally {
      setRevision((value) => value + 1);
    }
  };

  return (
    <section className="lm-storyboard-view" aria-label="故事板">
      <header className="lm-storyboard-header">
        <div>
          <strong>故事板</strong>
          <span>{visibleItems.length === items.length ? `${items.length} 个镜头` : `${visibleItems.length} / ${items.length} 个镜头`} · {readyCount} 个已有产物</span>
        </div>
        <div className="lm-storyboard-filters" role="tablist" aria-label="筛选故事板">
          {FILTERS.map((option) => <button type="button" role="tab" aria-selected={filter === option.value} className={filter === option.value ? "is-active" : ""} key={option.value} onClick={() => setFilter(option.value)}>{option.label}</button>)}
        </div>
        <button type="button" className="lm-icon-button" aria-label="刷新故事板" onClick={() => setRevision((value) => value + 1)}><RefreshCw aria-hidden="true" /></button>
      </header>

      <section className="lm-storyboard-key-elements" aria-label="关键元素">
        <button type="button" className="lm-storyboard-section-toggle" aria-expanded={keyElementsOpen} onClick={() => setKeyElementsOpen((open) => !open)}>
          {keyElementsOpen ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
          <strong>关键元素</strong><span>{keyElements.length} 项</span>
        </button>
        {keyElementsOpen ? keyElements.length ? (
          <div className="lm-storyboard-key-content">
            <div className="lm-storyboard-key-list">
              {keyElements.map((item) => {
                const Icon = KEY_ELEMENT_ICONS[item.category] || Package;
                return <button type="button" className={editingKeyElement?.id === item.id ? "is-active" : ""} key={item.id} onClick={() => setEditingKeyElement({ id: item.id, title: item.title, description: item.description })}>
                  <span className="lm-storyboard-key-preview">{item.mediaUrl ? <img src={item.mediaUrl} alt="" /> : <Icon aria-hidden="true" />}</span>
                  <span><strong>{item.title}</strong><small>{KEY_ELEMENT_LABELS[item.category]}</small></span>
                </button>;
              })}
            </div>
            {editingKeyElement ? <div className="lm-storyboard-key-editor">
              <label><span>名称</span><input value={editingKeyElement.title} maxLength={200} onChange={(event) => setEditingKeyElement((value) => ({ ...value, title: event.target.value }))} /></label>
              <label><span>描述</span><textarea value={editingKeyElement.description} maxLength={2000} onChange={(event) => setEditingKeyElement((value) => ({ ...value, description: event.target.value }))} /></label>
              <div><button type="button" onClick={() => locate(keyElements.find((item) => item.id === editingKeyElement.id))}><LocateFixed aria-hidden="true" />定位</button><button type="button" onClick={saveKeyElement}><Save aria-hidden="true" />保存</button></div>
            </div> : null}
          </div>
        ) : <p className="lm-storyboard-key-empty">从资源库插入角色、场景或道具后，会显示在这里。</p> : null}
      </section>

      {visibleItems.length ? (
        <div className="lm-storyboard-grid">
          {visibleItems.map((item) => {
            const itemIndex = items.findIndex((candidate) => candidate.id === item.id);
            const presentation = resolveCanvasStoryboardGenerationState(item, generationState.running && generationState.id === item.id);
            const running = presentation.running;
            const showGenerate = item.canGenerate || running;
            return (
            <article
              key={item.id}
              className={`lm-storyboard-card${draggingId === item.id ? " is-dragging" : ""}`}
              draggable
              onDragStart={(event) => { setDraggingId(item.id); event.dataTransfer.effectAllowed = "move"; }}
              onDragEnd={() => setDraggingId("")}
              onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
              onDrop={(event) => {
                event.preventDefault();
                if (draggingId) commitOrder(reorderCanvasStoryboardIds(items, draggingId, item.id));
                setDraggingId("");
              }}
            >
              <div className="lm-storyboard-media">
                <StoryboardPreview item={item} />
                <span className="lm-storyboard-number">{String(item.position).padStart(2, "0")}</span>
                <span className={`lm-storyboard-kind is-${item.mediaKind}`}>{item.mediaKind === "video" ? "视频" : item.mediaKind === "audio" ? "音频" : item.mediaKind === "text" ? "文本" : "图片"}</span>
              </div>
              <div className="lm-storyboard-card-copy">
                <GripVertical aria-hidden="true" />
                <div><strong title={item.title}>{item.title}</strong><span>{presentation.statusLabel}</span><GeneratorMetadata item={item} /></div>
                <div className="lm-storyboard-actions">
                  <button type="button" className="lm-icon-button" aria-label={`上移 ${item.title}`} disabled={itemIndex === 0} onClick={() => commitOrder(moveCanvasStoryboardId(items, item.id, "backward"))}><ArrowUp aria-hidden="true" /></button>
                  <button type="button" className="lm-icon-button" aria-label={`下移 ${item.title}`} disabled={itemIndex === items.length - 1} onClick={() => commitOrder(moveCanvasStoryboardId(items, item.id, "forward"))}><ArrowDown aria-hidden="true" /></button>
                  <button type="button" className="lm-icon-button" aria-label={`定位 ${item.title}`} onClick={() => locate(item)}><LocateFixed aria-hidden="true" /></button>
                </div>
              </div>
              {showGenerate ? <button type="button" className="lm-storyboard-generate" disabled={!onGenerate || generationState.running || running} onClick={() => generate(item)}>{running ? <><LoaderCircle className="is-spinning" aria-hidden="true" />{presentation.actionLabel}</> : presentation.action === "confirm" ? <><Sparkles aria-hidden="true" />{presentation.actionLabel}</> : <><RotateCw aria-hidden="true" />{presentation.actionLabel}</>}</button> : null}
            </article>
            );
          })}
        </div>
      ) : items.length ? (
        <div className="lm-storyboard-empty"><Film aria-hidden="true" /><strong>没有匹配的镜头</strong><span>切换筛选条件查看其他图片、视频或待生成节点。</span></div>
      ) : (
        <div className="lm-storyboard-empty"><Film aria-hidden="true" /><strong>暂无镜头</strong><span>在工作流中添加图片、视频或生成节点后，这里会自动形成故事板。</span><button type="button" onClick={onOpenWorkflow}>返回工作流</button></div>
      )}
    </section>
  );
}
