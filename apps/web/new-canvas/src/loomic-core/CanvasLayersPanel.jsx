import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, ChevronUp, ChevronsDownUp, ChevronsUpDown, Eye, EyeOff, GripVertical, Group, Lock, Pencil, Search, Trash2, Ungroup, Unlock, X } from "lucide-react";
import { buildCanvasLayerTree, filterCanvasLayers, getCanvasLayerGroupElementIds, LAYER_TYPE_OPTIONS } from "./canvas-layer-utils.js";
import {
  deleteCanvasLayers,
  dropCanvasLayers,
  groupCanvasLayers,
  moveCanvasLayer,
  moveCanvasLayers,
  renameCanvasLayer,
  renameCanvasLayerGroup,
  setCanvasLayersLocked,
  setCanvasLayersVisible,
  ungroupCanvasLayers,
} from "./canvas-layer-operations.js";
import { projectCanvasConnectionsForView, restoreCanvasConnectionsForPersistence } from "./canvas-connection-visibility.js";
import { generateCanvasId } from "./canvas-elements.js";

function throttle(callback, delay) {
  let timer = null;
  let pending = false;
  const run = () => {
    if (timer) { pending = true; return; }
    callback();
    timer = setTimeout(() => {
      timer = null;
      if (pending) { pending = false; run(); }
    }, delay);
  };
  run.cancel = () => { if (timer) clearTimeout(timer); timer = null; pending = false; };
  return run;
}

function labelFor(element) {
  if (element.customData?.title) return String(element.customData.title).slice(0, 28);
  if (element.customData?.type === "image-generator") return element.customData.prompt || "图片生成";
  if (element.customData?.type === "video-generator") return element.customData.prompt || "视频生成";
  if (element.type === "text") return element.text?.slice(0, 28) || "文字";
  if (element.type === "image") return element.customData?.title?.slice(0, 28) || "图片";
  const labels = { rectangle: "矩形", ellipse: "椭圆", diamond: "菱形", line: "直线", arrow: "箭头", freedraw: "画笔", embeddable: "视频" };
  return labels[element.type] ?? "画布对象";
}

function iconFor(element) {
  if (element.customData?.type === "image-generator") return "✦";
  if (element.customData?.type === "video-generator") return "▶";
  return { text: "T", image: "▧", rectangle: "▭", ellipse: "○", diamond: "◇", line: "—", arrow: "→", freedraw: "⌁", embeddable: "▶" }[element.type] ?? "◆";
}

const LayerRow = memo(function LayerRow({
  element,
  file,
  selected,
  renaming,
  renameValue,
  onRenameValue,
  onCommitRename,
  onCancelRename,
  onStartRename,
  onSelect,
  onToggleSelection,
  onToggleLock,
  onToggleVisible,
  onMove,
  dropPosition,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}) {
  const hidden = element.customData?.loomicHidden === true;
  return (
    <div
      className={`loomic-layer-row ${selected ? "is-selected" : ""} ${hidden ? "is-hidden" : ""} ${dropPosition ? `is-drop-${dropPosition}` : ""}`}
      style={{ "--layer-depth": element.groupIds?.length ?? 0 }}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <span className="loomic-layer-drag" draggable="true" role="button" tabIndex={0} aria-label={`拖动 ${labelFor(element)}`} title="拖动图层" onDragStart={onDragStart} onDragEnd={onDragEnd}><GripVertical aria-hidden="true" /></span>
      <input className="loomic-layer-check" type="checkbox" checked={selected} aria-label={`选择 ${labelFor(element)}`} onChange={() => onToggleSelection(element.id)} />
      <div
        className="loomic-layer-main"
        role="button"
        tabIndex={0}
        onClick={() => onSelect(element.id)}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
          event.preventDefault();
          onSelect(element.id);
        }}
      >
        <span className="loomic-layer-thumb">
          {element.type === "image" && file?.dataURL
            ? <img src={file.dataURL} alt="" loading="lazy" />
            : iconFor(element)}
        </span>
        {renaming ? (
          <input
            className="loomic-layer-rename"
            value={renameValue}
            aria-label="重命名图层"
            autoFocus
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onRenameValue(event.target.value)}
            onBlur={onCommitRename}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") onCommitRename();
              if (event.key === "Escape") onCancelRename();
            }}
          />
        ) : <span className="loomic-layer-label" onDoubleClick={(event) => { event.stopPropagation(); onStartRename(element); }}>{labelFor(element)}</span>}
      </div>
      <button className="loomic-layer-action" type="button" aria-label="上移图层" title="上移" onClick={() => onMove(element.id, "forward")}><ChevronUp aria-hidden="true" /></button>
      <button className="loomic-layer-action" type="button" aria-label="下移图层" title="下移" onClick={() => onMove(element.id, "backward")}><ChevronDown aria-hidden="true" /></button>
      <button className="loomic-layer-action" type="button" aria-label="重命名图层" title="重命名" onClick={() => onStartRename(element)}><Pencil aria-hidden="true" /></button>
      <button className={`loomic-layer-action ${element.locked ? "is-active" : ""}`} type="button" aria-label={element.locked ? "解锁" : "锁定"} title={element.locked ? "解锁" : "锁定"} onClick={() => onToggleLock(element.id)}>{element.locked ? <Lock aria-hidden="true" /> : <Unlock aria-hidden="true" />}</button>
      <button className={`loomic-layer-action ${hidden ? "is-active" : ""}`} type="button" aria-label={hidden ? "显示" : "隐藏"} title={hidden ? "显示" : "隐藏"} onClick={() => onToggleVisible(element.id)}>{hidden ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button>
    </div>
  );
});

const LayerGroupRow = memo(function LayerGroupRow({ group, collapsed, selectedCount, locked, hidden, renaming, renameValue, onRenameValue, onCommitRename, onCancelRename, onStartRename, onToggleCollapsed, onSelect, onToggleSelection, onToggleLock, onToggleVisible, onMove, onDelete, dropPosition, onDragStart, onDragEnd, onDragOver, onDrop }) {
  const checkRef = useRef(null);
  const allSelected = selectedCount === group.elementIds.length;
  useEffect(() => {
    if (checkRef.current) checkRef.current.indeterminate = selectedCount > 0 && !allSelected;
  }, [allSelected, selectedCount]);
  return (
    <div
      className={`loomic-layer-group-row ${selectedCount ? "is-selected" : ""} ${hidden ? "is-hidden" : ""} ${dropPosition ? `is-drop-${dropPosition}` : ""}`}
      style={{ "--layer-depth": group.depth }}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <span className="loomic-layer-drag" draggable="true" role="button" tabIndex={0} aria-label="拖动图层组" title="拖动图层组" onDragStart={onDragStart} onDragEnd={onDragEnd}><GripVertical aria-hidden="true" /></span>
      <button className="loomic-layer-disclosure" type="button" aria-label={collapsed ? "展开组" : "折叠组"} aria-expanded={!collapsed} onClick={onToggleCollapsed}>
        <ChevronRight aria-hidden="true" />
      </button>
      <input ref={checkRef} className="loomic-layer-check" type="checkbox" checked={allSelected} aria-label={`选择组内 ${group.elementIds.length} 个图层`} onChange={onToggleSelection} />
      {renaming ? (
        <div className="loomic-layer-group-main">
          <Group aria-hidden="true" />
          <input
            className="loomic-layer-rename"
            value={renameValue}
            aria-label="重命名图层组"
            autoFocus
            onChange={(event) => onRenameValue(event.target.value)}
            onBlur={onCommitRename}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") onCommitRename();
              if (event.key === "Escape") onCancelRename();
            }}
          />
          <small>{group.elementIds.length}</small>
        </div>
      ) : (
        <button className="loomic-layer-group-main" type="button" onClick={onSelect}>
          <Group aria-hidden="true" />
          <span onDoubleClick={(event) => { event.stopPropagation(); onStartRename(); }}>{group.name}</span>
          <small>{group.elementIds.length}</small>
        </button>
      )}
      <button className="loomic-layer-action" type="button" aria-label="上移图层组" title="上移" onClick={() => onMove("forward")}><ChevronUp aria-hidden="true" /></button>
      <button className="loomic-layer-action" type="button" aria-label="下移图层组" title="下移" onClick={() => onMove("backward")}><ChevronDown aria-hidden="true" /></button>
      <button className="loomic-layer-action" type="button" aria-label="重命名图层组" title="重命名" onClick={onStartRename}><Pencil aria-hidden="true" /></button>
      <button className={`loomic-layer-action ${locked ? "is-active" : ""}`} type="button" aria-label={locked ? "解锁图层组" : "锁定图层组"} title={locked ? "解锁" : "锁定"} onClick={onToggleLock}>{locked ? <Lock aria-hidden="true" /> : <Unlock aria-hidden="true" />}</button>
      <button className={`loomic-layer-action ${hidden ? "is-active" : ""}`} type="button" aria-label={hidden ? "显示图层组" : "隐藏图层组"} title={hidden ? "显示" : "隐藏"} onClick={onToggleVisible}>{hidden ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button>
      <button className="loomic-layer-action is-danger" type="button" aria-label="删除图层组" title="删除" onClick={onDelete}><Trash2 aria-hidden="true" /></button>
    </div>
  );
});

export function CanvasLayersPanel({ excalidrawApi, open, onClose }) {
  const [elements, setElements] = useState([]);
  const [files, setFiles] = useState({});
  const [selectedIds, setSelectedIds] = useState({});
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [renamingId, setRenamingId] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [renamingGroupKey, setRenamingGroupKey] = useState("");
  const [groupRenameValue, setGroupRenameValue] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const [dragPayload, setDragPayload] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  const refresh = useCallback(() => {
    if (!excalidrawApi) return;
    setElements(excalidrawApi.getSceneElements().filter((element) => !element.isDeleted).slice().reverse());
    setFiles(excalidrawApi.getFiles() ?? {});
    setSelectedIds(excalidrawApi.getAppState().selectedElementIds ?? {});
  }, [excalidrawApi]);

  useEffect(() => {
    if (!open || !excalidrawApi) return undefined;
    refresh();
    const throttledRefresh = throttle(refresh, 100);
    const unsubscribe = excalidrawApi.onChange(throttledRefresh);
    return () => { throttledRefresh.cancel(); if (typeof unsubscribe === "function") unsubscribe(); };
  }, [open, excalidrawApi, refresh]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => {
      if (event.key !== "Escape" || event.target.closest?.(".loomic-layer-rename")) return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", closeOnEscape, true);
    return () => document.removeEventListener("keydown", closeOnEscape, true);
  }, [open, onClose]);

  const updateElements = useCallback((transform) => {
    const persistent = restoreCanvasConnectionsForPersistence(excalidrawApi, excalidrawApi.getSceneElements());
    const next = transform(persistent);
    const projected = projectCanvasConnectionsForView(excalidrawApi, next, { rebase: true });
    excalidrawApi.updateScene({ elements: projected, captureUpdate: "IMMEDIATELY" });
    refresh();
  }, [excalidrawApi, refresh]);

  const selectElement = useCallback((id) => {
    const element = excalidrawApi.getSceneElements().find((item) => item.id === id && !item.isDeleted);
    if (!element) return;
    excalidrawApi.updateScene({ appState: { selectedElementIds: { [id]: true } } });
    excalidrawApi.scrollToContent(element, { fitToContent: false, animate: true, duration: 250 });
  }, [excalidrawApi]);
  const toggleSelection = useCallback((id) => {
    const current = { ...(excalidrawApi.getAppState().selectedElementIds ?? {}) };
    if (current[id]) delete current[id];
    else current[id] = true;
    excalidrawApi.updateScene({ appState: { selectedElementIds: current } });
  }, [excalidrawApi]);
  const toggleLock = useCallback((id) => {
    const element = excalidrawApi.getSceneElements().find((item) => item.id === id);
    updateElements((items) => setCanvasLayersLocked(items, [id], !element?.locked));
  }, [excalidrawApi, updateElements]);
  const toggleVisible = useCallback((id) => {
    const element = excalidrawApi.getSceneElements().find((item) => item.id === id);
    updateElements((items) => setCanvasLayersVisible(items, [id], element?.customData?.loomicHidden === true));
  }, [excalidrawApi, updateElements]);
  const moveLayer = useCallback((id, direction) => updateElements((items) => moveCanvasLayer(items, id, direction)), [updateElements]);
  const selectGroup = useCallback((ids) => {
    const live = excalidrawApi.getSceneElements().filter((item) => ids.includes(item.id) && !item.isDeleted);
    if (!live.length) return;
    excalidrawApi.updateScene({ appState: { selectedElementIds: Object.fromEntries(live.map((item) => [item.id, true])) } });
    excalidrawApi.scrollToContent(live, { fitToContent: false, animate: true, duration: 250 });
  }, [excalidrawApi]);
  const toggleGroupSelection = useCallback((ids) => {
    const current = { ...(excalidrawApi.getAppState().selectedElementIds ?? {}) };
    const allSelected = ids.every((id) => current[id]);
    ids.forEach((id) => { if (allSelected) delete current[id]; else current[id] = true; });
    excalidrawApi.updateScene({ appState: { selectedElementIds: current } });
  }, [excalidrawApi]);
  const toggleGroupCollapsed = useCallback((key) => setCollapsedGroups((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  }), []);
  const startRename = useCallback((element) => {
    setRenamingId(element.id);
    setRenameValue(labelFor(element));
  }, []);
  const cancelRename = useCallback(() => { setRenamingId(""); setRenameValue(""); }, []);
  const commitRename = useCallback(() => {
    if (renamingId && renameValue.trim()) updateElements((items) => renameCanvasLayer(items, renamingId, renameValue));
    cancelRename();
  }, [cancelRename, renameValue, renamingId, updateElements]);
  const startGroupRename = useCallback((group) => {
    setRenamingGroupKey(group.key);
    setGroupRenameValue(group.name);
  }, []);
  const cancelGroupRename = useCallback(() => { setRenamingGroupKey(""); setGroupRenameValue(""); }, []);
  const commitGroupRename = useCallback((groupId) => {
    if (groupId && groupRenameValue.trim()) updateElements((items) => renameCanvasLayerGroup(items, groupId, groupRenameValue));
    cancelGroupRename();
  }, [cancelGroupRename, groupRenameValue, updateElements]);

  const beginDrag = useCallback((event, payload) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", payload.key);
    setDragPayload(payload);
    setDropTarget(null);
  }, []);
  const endDrag = useCallback(() => {
    setDragPayload(null);
    setDropTarget(null);
  }, []);
  const dragOverNode = useCallback((event, node) => {
    if (!dragPayload) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = bounds.height ? (event.clientY - bounds.top) / bounds.height : 0.5;
    const position = node.kind === "group"
      ? (ratio < 0.28 ? "before" : ratio > 0.72 ? "after" : "inside")
      : (ratio < 0.5 ? "before" : "after");
    setDropTarget((current) => current?.key === node.key && current.position === position ? current : { key: node.key, position });
  }, [dragPayload]);
  const dropOnNode = useCallback((event, node) => {
    event.preventDefault();
    event.stopPropagation();
    if (!dragPayload) return;
    const position = dropTarget?.key === node.key ? dropTarget.position : (node.kind === "group" ? "inside" : "before");
    const inside = node.kind === "group" && position === "inside";
    const targetIds = node.kind === "group" ? (node.dragElementIds ?? node.elementIds) : [node.id];
    const targetParentGroupIds = inside
      ? node.groupIds
      : node.kind === "group" ? node.parentGroupIds : node.groupIds;
    updateElements((items) => dropCanvasLayers(items, dragPayload.ids, {
      sourceParentGroupIds: dragPayload.sourceParentGroupIds,
      targetIds,
      targetParentGroupIds,
      position: position === "after" ? "backward" : "forward",
    }));
    endDrag();
  }, [dragPayload, dropTarget, endDrag, updateElements]);
  const dropAtRoot = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!dragPayload) return;
    updateElements((items) => dropCanvasLayers(items, dragPayload.ids, {
      sourceParentGroupIds: dragPayload.sourceParentGroupIds,
      targetParentGroupIds: [],
      position: "forward",
    }));
    endDrag();
  }, [dragPayload, endDrag, updateElements]);

  const filteredElements = useMemo(() => filterCanvasLayers(elements, {
    query,
    type: typeFilter,
    getLabel: labelFor,
  }), [elements, query, typeFilter]);
  const countLabel = useMemo(() => filteredElements.length === elements.length
    ? `${elements.length} 个对象`
    : `${filteredElements.length} / ${elements.length} 个对象`, [elements.length, filteredElements.length]);
  const selectedIdList = useMemo(() => Object.keys(selectedIds).filter((id) => selectedIds[id]), [selectedIds]);
  const selectedElements = useMemo(() => elements.filter((element) => selectedIds[element.id]), [elements, selectedIds]);
  const allSelectedLocked = Boolean(selectedElements.length) && selectedElements.every((element) => element.locked);
  const allSelectedHidden = Boolean(selectedElements.length) && selectedElements.every((element) => element.customData?.loomicHidden === true);
  const canUngroup = selectedElements.some((element) => element.groupIds?.length);
  const layerTree = useMemo(() => buildCanvasLayerTree(filteredElements), [filteredElements]);
  const groupKeys = useMemo(() => {
    const keys = [];
    const visit = (nodes) => nodes.forEach((node) => {
      if (node.kind !== "group") return;
      keys.push(node.key);
      visit(node.children);
    });
    visit(layerTree);
    return keys;
  }, [layerTree]);
  const allGroupsCollapsed = Boolean(groupKeys.length) && groupKeys.every((key) => collapsedGroups.has(key));
  const renderTree = (nodes) => nodes.map((node) => {
    if (node.kind === "element") {
      const element = node.element;
      return (
        <LayerRow
          key={node.key}
          element={element}
          file={element.fileId ? files[element.fileId] : null}
          selected={Boolean(selectedIds[element.id])}
          renaming={renamingId === element.id}
          renameValue={renameValue}
          onRenameValue={setRenameValue}
          onCommitRename={commitRename}
          onCancelRename={cancelRename}
          onStartRename={startRename}
          onSelect={selectElement}
          onToggleSelection={toggleSelection}
          onToggleLock={toggleLock}
          onToggleVisible={toggleVisible}
          onMove={moveLayer}
          dropPosition={dropTarget?.key === node.key ? dropTarget.position : ""}
          onDragStart={(event) => beginDrag(event, { key: node.key, ids: [node.id], sourceParentGroupIds: node.groupIds })}
          onDragEnd={endDrag}
          onDragOver={(event) => dragOverNode(event, node)}
          onDrop={(event) => dropOnNode(event, node)}
        />
      );
    }
    const memberIds = getCanvasLayerGroupElementIds(elements, node.groupIds);
    const members = elements.filter((element) => memberIds.includes(element.id));
    const fullGroup = { ...node, elementIds: memberIds };
    const dragNode = { ...fullGroup, dragElementIds: memberIds };
    const selectedCount = memberIds.filter((id) => selectedIds[id]).length;
    const collapsed = collapsedGroups.has(node.key);
    const locked = Boolean(members.length) && members.every((element) => element.locked);
    const hidden = Boolean(members.length) && members.every((element) => element.customData?.loomicHidden === true);
    return (
      <React.Fragment key={node.key}>
        <LayerGroupRow
          group={fullGroup}
          collapsed={collapsed}
          selectedCount={selectedCount}
          locked={locked}
          hidden={hidden}
          renaming={renamingGroupKey === node.key}
          renameValue={groupRenameValue}
          onRenameValue={setGroupRenameValue}
          onCommitRename={() => commitGroupRename(node.id)}
          onCancelRename={cancelGroupRename}
          onStartRename={() => startGroupRename(node)}
          onToggleCollapsed={() => toggleGroupCollapsed(node.key)}
          onSelect={() => selectGroup(memberIds)}
          onToggleSelection={() => toggleGroupSelection(memberIds)}
          onToggleLock={() => updateElements((items) => setCanvasLayersLocked(items, memberIds, !locked))}
          onToggleVisible={() => updateElements((items) => setCanvasLayersVisible(items, memberIds, hidden))}
          onMove={(direction) => updateElements((items) => moveCanvasLayers(items, memberIds, direction))}
          onDelete={() => updateElements((items) => deleteCanvasLayers(items, memberIds))}
          dropPosition={dropTarget?.key === node.key ? dropTarget.position : ""}
          onDragStart={(event) => beginDrag(event, { key: node.key, ids: memberIds, sourceParentGroupIds: node.parentGroupIds })}
          onDragEnd={endDrag}
          onDragOver={(event) => dragOverNode(event, dragNode)}
          onDrop={(event) => dropOnNode(event, dragNode)}
        />
        {!collapsed ? renderTree(node.children) : null}
      </React.Fragment>
    );
  });
  if (!open) return null;

  return (
    <aside className="loomic-layers-panel" onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
      <header>
        <div><strong>图层</strong><span>{countLabel}</span></div>
        <div className="loomic-layer-header-actions">
          <button
            className="loomic-icon-button"
            type="button"
            disabled={!groupKeys.length}
            title={allGroupsCollapsed ? "展开全部分组" : "收起全部分组"}
            aria-label={allGroupsCollapsed ? "展开全部分组" : "收起全部分组"}
            onClick={() => setCollapsedGroups(allGroupsCollapsed ? new Set() : new Set(groupKeys))}
          >{allGroupsCollapsed ? <ChevronsUpDown aria-hidden="true" /> : <ChevronsDownUp aria-hidden="true" />}</button>
          <button className="loomic-icon-button" type="button" title="关闭图层" onClick={onClose}><X aria-hidden="true" /></button>
        </div>
      </header>
      <div className="loomic-layer-filters">
        <label className="loomic-layer-search">
          <Search aria-hidden="true" />
          <input
            type="search"
            value={query}
            aria-label="搜索图层"
            placeholder="搜索图层"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select value={typeFilter} aria-label="按类型筛选图层" onChange={(event) => setTypeFilter(event.target.value)}>
          {LAYER_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
      {selectedIdList.length ? (
        <div className="loomic-layer-batch" role="toolbar" aria-label={`批量操作 ${selectedIdList.length} 个图层`}>
          <span>{selectedIdList.length} 已选</span>
          <button type="button" aria-label={allSelectedLocked ? "批量解锁" : "批量锁定"} title={allSelectedLocked ? "批量解锁" : "批量锁定"} onClick={() => updateElements((items) => setCanvasLayersLocked(items, selectedIdList, !allSelectedLocked))}>{allSelectedLocked ? <Unlock aria-hidden="true" /> : <Lock aria-hidden="true" />}</button>
          <button type="button" aria-label={allSelectedHidden ? "批量显示" : "批量隐藏"} title={allSelectedHidden ? "批量显示" : "批量隐藏"} onClick={() => updateElements((items) => setCanvasLayersVisible(items, selectedIdList, allSelectedHidden))}>{allSelectedHidden ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}</button>
          <button type="button" aria-label="组合图层" title="组合" disabled={selectedIdList.length < 2} onClick={() => updateElements((items) => groupCanvasLayers(items, selectedIdList, `loomic-${generateCanvasId()}`))}><Group aria-hidden="true" /></button>
          <button type="button" aria-label="取消组合" title="取消组合" disabled={!canUngroup} onClick={() => updateElements((items) => ungroupCanvasLayers(items, selectedIdList))}><Ungroup aria-hidden="true" /></button>
          <button type="button" className="is-danger" aria-label="删除所选图层" title="删除" onClick={() => updateElements((items) => deleteCanvasLayers(items, selectedIdList))}><Trash2 aria-hidden="true" /></button>
        </div>
      ) : null}
      <div className="loomic-layer-list">
        {!elements.length && <p className="loomic-empty-state">画布为空</p>}
        {Boolean(elements.length) && !filteredElements.length && <p className="loomic-empty-state">没有匹配的图层</p>}
        {dragPayload ? (
          <div className="loomic-layer-root-drop" role="button" aria-label="移到顶层" onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move"; }} onDrop={dropAtRoot}>
            <Ungroup aria-hidden="true" /><span>移到顶层</span>
          </div>
        ) : null}
        {renderTree(layerTree)}
      </div>
    </aside>
  );
}
