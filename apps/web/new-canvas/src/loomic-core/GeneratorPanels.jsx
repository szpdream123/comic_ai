import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, RefreshCw, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import { CanvasGenerationNotice } from "./CanvasGenerationNotice.jsx";
import { useCanvasGenerationConfig } from "./CanvasGenerationConfigContext.jsx";
import {
  buildCanvasModelSelectionPatch,
  buildCanvasParameterPatch,
  canvasParameterRepresentsAspectRatio,
  hasCanvasGenerationBaseline,
  markCanvasGeneratorInputUpdated,
  resolveCanvasGenerationModel,
  resolveCanvasGenerationModels,
  resolveCanvasGenerationPresets,
  resolveCanvasModelParameterControls,
  resolveCanvasParameterValue,
} from "./canvas-generation-models.js";
import {
  deleteImageGeneratorElement,
  resizeImageGeneratorElement,
  updateImageGeneratorElement,
} from "./image-generator-elements.js";
import {
  deleteVideoGeneratorElement,
  resizeVideoGeneratorElement,
  updateVideoGeneratorElement,
} from "./video-generator-elements.js";
import { prepareCanvasReferenceImageSources } from "./canvas-file-persistence.js";
import { buildCanvasGenerationParameters } from "./canvas-generation.js";
import {
  canvasGenerationCreditMessage,
  resolveCanvasGenerationCreditState,
} from "./canvas-generation-credits.js";

function useFloatingPosition(bounds, viewport, panelRef) {
  const [position, setPosition] = useState({ left: 16, top: 16, visibility: "hidden" });
  useEffect(() => {
    if (!bounds) return;
    const zoom = viewport.zoom || 1;
    const canvas = document.querySelector(".loomic-canvas-root")?.getBoundingClientRect();
    const originX = canvas?.left ?? 0;
    const originY = canvas?.top ?? 0;
    const elementLeft = originX + (bounds.x + viewport.scrollX) * zoom;
    const elementTop = originY + (bounds.y + viewport.scrollY) * zoom;
    const elementWidth = bounds.width * zoom;
    const elementHeight = bounds.height * zoom;
    const panelWidth = panelRef.current?.offsetWidth ?? 360;
    const panelHeight = panelRef.current?.offsetHeight ?? 320;
    const minLeft = (canvas?.left ?? 0) + 12;
    const maxLeft = Math.max(minLeft, (canvas?.right ?? window.innerWidth) - panelWidth - 12);
    const minTop = (canvas?.top ?? 0) + 12;
    const maxTop = Math.max(minTop, (canvas?.bottom ?? window.innerHeight) - panelHeight - 12);
    const below = elementTop + elementHeight + 12;
    const top = below + panelHeight < window.innerHeight - 12
      ? below
      : elementTop - panelHeight - 12;
    setPosition({
      left: Math.max(minLeft, Math.min(elementLeft + elementWidth / 2 - panelWidth / 2, maxLeft)),
      top: Math.max(minTop, Math.min(top, maxTop)),
      visibility: "visible",
    });
  }, [bounds, viewport]);
  return position;
}

function Segmented({ value, options, onChange, label }) {
  return (
    <div className="loomic-segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={value === option ? "is-active" : ""}
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error ?? new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

function ReferenceImages({ images, onChange, onArchiveImage, onArchiveError, limit = 6, labels }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const addFiles = useCallback(async (event) => {
    const files = Array.from(event.target.files ?? []).slice(0, Math.max(0, limit - images.length));
    event.target.value = "";
    if (!files.length) return;
    setUploading(true);
    try {
      const next = await prepareCanvasReferenceImageSources(files, {
        archive: onArchiveImage,
        read: fileToDataUrl,
      });
      onChange([...images, ...next].slice(0, limit));
    } catch (error) {
      onArchiveError?.(error);
    } finally {
      setUploading(false);
    }
  }, [images, limit, onArchiveError, onArchiveImage, onChange]);
  return (
    <div className="loomic-field">
      <span>参考素材</span>
      <div className="loomic-reference-list">
        {images.map((source, index) => (
          <div className="loomic-reference-item" key={`${source.slice(0, 32)}-${index}`}>
            <img src={source} alt={labels?.[index] ?? `参考图 ${index + 1}`} />
            {labels?.[index] && <small>{labels[index]}</small>}
            <button type="button" title="移除" onClick={() => onChange(images.filter((_, itemIndex) => itemIndex !== index))}><X aria-hidden="true" /></button>
          </div>
        ))}
        {images.length < limit && <button type="button" className="loomic-reference-add" title={uploading ? "正在上传参考图" : "添加参考图"} disabled={uploading} onClick={() => inputRef.current?.click()}><Plus aria-hidden="true" /></button>}
      </div>
      <input ref={inputRef} className="loomic-visually-hidden" type="file" accept="image/*" multiple={limit > 1} onChange={addFiles} />
    </div>
  );
}

function PanelFrame({ title, kind, children, onClose, onDelete, position, panelRef, inputUpdated = false, inputUpdatedOpen = false, onInputUpdatedClick }) {
  const theme = document.querySelector(".loomic-canvas-root")?.dataset.theme ?? "dark";
  return (
    <div
      ref={panelRef}
      className="loomic-generator-panel"
      data-theme={theme}
      style={position}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <header>
        <span className={`loomic-kind-dot is-${kind}`} />
        <strong>
          {title}
          {inputUpdated ? (
            <button
              type="button"
              className="loomic-input-updated-trigger"
              aria-expanded={inputUpdatedOpen}
              onClick={onInputUpdatedClick}
            >
              输入已更新
            </button>
          ) : null}
        </strong>
        {onDelete ? <button type="button" className="loomic-icon-button" title="删除节点" onClick={onDelete}><Trash2 aria-hidden="true" /></button> : null}
        <button type="button" className="loomic-icon-button" title="关闭" onClick={onClose}><X aria-hidden="true" /></button>
      </header>
      {children}
    </div>
  );
}

export function ImageSourceActionsPanel({ elementBounds, canvasScrollZoom, onClose, onImageToImage }) {
  const panelRef = useRef(null);
  const position = useFloatingPosition(elementBounds, canvasScrollZoom, panelRef);
  return createPortal(
    <PanelFrame title="图片素材" kind="image" position={position} panelRef={panelRef} onClose={onClose}>
      <button className="loomic-generate-button" type="button" onClick={onImageToImage}>
        <Sparkles aria-hidden="true" />图生图
      </button>
    </PanelFrame>,
    document.body,
  );
}

function useGeneratorModelState(kind, data, update) {
  const generationConfig = useCanvasGenerationConfig();
  const models = useMemo(
    () => resolveCanvasGenerationModels(generationConfig.config, kind),
    [generationConfig.config, kind],
  );
  const selectedModel = useMemo(
    () => resolveCanvasGenerationModel(generationConfig.config, kind, data.model),
    [data.model, generationConfig.config, kind],
  );
  const configuredSelection = Boolean(selectedModel && models.some((model) => model.code === data.model));

  useEffect(() => {
    if (generationConfig.status !== "ready" || !selectedModel || configuredSelection) return;
    update(buildCanvasModelSelectionPatch(data, selectedModel.raw, kind));
  }, [configuredSelection, data, generationConfig.status, kind, selectedModel, update]);

  return {
    ...generationConfig,
    models,
    selectedModel,
    ready: generationConfig.status === "ready" && configuredSelection,
  };
}

function displayParameterOption(control, option) {
  const label = String(option.label ?? option.value ?? "");
  if (["durationSec", "videoDurationSec"].includes(control.key) && !label.endsWith("秒")) return `${label} 秒`;
  if (control.key === "count" && !/[张条个]$/.test(label)) return `${label} 个`;
  return label;
}

function GeneratorModelControls({ kind, data, update, changeRatio, state }) {
  if (state.status === "loading" || state.status === "idle") {
    return <p className="loomic-model-status">正在加载可用模型…</p>;
  }
  if (state.status === "error") {
    return (
      <div className="loomic-model-status is-error">
        <span>{state.error || "模型配置加载失败"}</span>
        <button type="button" title="重新加载模型" onClick={state.reload}><RefreshCw aria-hidden="true" /></button>
      </div>
    );
  }
  if (!state.models.length || !state.selectedModel) {
    return <p className="loomic-model-status is-error">后台没有可用于{kind === "video" ? "视频" : "图片"}生成的模型</p>;
  }

  const model = state.selectedModel.raw;
  const controls = resolveCanvasModelParameterControls(model, kind);
  const presets = resolveCanvasGenerationPresets(state.config, kind, state.selectedModel.code);
  const selectModel = (modelCode) => {
    const next = state.models.find((item) => item.code === modelCode);
    if (next) update(buildCanvasModelSelectionPatch(data, next.raw, kind));
  };
  const selectParameter = (control, rawValue) => {
    const option = control.options.find((item) => String(item.value) === rawValue);
    const value = option?.value ?? rawValue;
    if (canvasParameterRepresentsAspectRatio(control)) changeRatio(String(value));
    update(buildCanvasParameterPatch(data, control.key, value, model, kind));
  };

  return (
    <section className="loomic-model-controls" aria-label="模型与生成参数">
      <label className="loomic-field">
        <span>模型</span>
        <select value={state.selectedModel.code} onChange={(event) => selectModel(event.target.value)}>
          {state.models.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
        </select>
      </label>
      {state.selectedModel.provider || state.selectedModel.remark ? (
        <p className="loomic-model-meta">
          {state.selectedModel.provider ? <strong>{state.selectedModel.provider}</strong> : null}
          {state.selectedModel.remark ? <span>{state.selectedModel.remark}</span> : null}
        </p>
      ) : null}
      {presets.length ? (
        <label className="loomic-field">
          <span>参数预设</span>
          <select defaultValue="" onChange={(event) => {
            const preset = presets.find((item) => item.id === event.target.value);
            if (preset) update(buildCanvasModelSelectionPatch(data, model, kind, preset.parameters));
            event.target.value = "";
          }}>
            <option value="" disabled>选择后台预设</option>
            {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
          </select>
        </label>
      ) : null}
      <div className="loomic-model-parameter-grid">
        {controls.map((control) => {
          const current = resolveCanvasParameterValue(data, model, control);
          const ratioControl = canvasParameterRepresentsAspectRatio(control) && control.options.length <= 6;
          if (control.type === "boolean") {
            return (
              <label className="loomic-field loomic-model-parameter is-boolean" key={control.key}>
                <span>{control.label}</span>
                <input
                  type="checkbox"
                  checked={current === true || current === "true"}
                  onChange={(event) => selectParameter(control, event.target.checked)}
                />
              </label>
            );
          }
          return ratioControl ? (
            <div className="loomic-field loomic-model-parameter is-wide" key={control.key}>
              <span>{control.label}</span>
              <Segmented
                label={control.label}
                value={current}
                options={control.options.map((option) => option.value)}
                onChange={(value) => selectParameter(control, String(value))}
              />
            </div>
          ) : (
            <label className="loomic-field loomic-model-parameter" key={control.key}>
              <span>{control.label}</span>
              <select value={String(current)} onChange={(event) => selectParameter(control, event.target.value)}>
                {control.options.map((option) => (
                  <option key={String(option.value)} value={String(option.value)}>{displayParameterOption(control, option)}</option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
      <button
        type="button"
        className="loomic-model-reset"
        onClick={() => update(buildCanvasModelSelectionPatch(data, model, kind))}
      >
        <RotateCcw aria-hidden="true" />恢复模型默认值
      </button>
    </section>
  );
}

function GenerationCreditNotice({ credit, balanceStatus }) {
  return (
    <p className={`loomic-generation-credit ${credit.insufficient ? "is-insufficient" : ""}`} role={credit.insufficient ? "alert" : "status"}>
      {canvasGenerationCreditMessage(credit, balanceStatus)}
    </p>
  );
}

export function ImageGeneratorPanel({ elementId, elementBounds, data, excalidrawApi, canvasScrollZoom, onClose, onGenerate, onArchiveImage, generating = false, generationError = "" }) {
  const panelRef = useRef(null);
  const position = useFloatingPosition(elementBounds, canvasScrollZoom, panelRef);
  const [prompt, setPrompt] = useState(data.prompt ?? "");
  const [staleActionsOpen, setStaleActionsOpen] = useState(false);
  useEffect(() => setPrompt(data.prompt ?? ""), [data.prompt]);

  const update = useCallback((updates) => updateImageGeneratorElement(excalidrawApi, elementId, updates), [excalidrawApi, elementId]);
  const changeRatio = useCallback((ratio) => resizeImageGeneratorElement(excalidrawApi, elementId, ratio), [excalidrawApi, elementId]);
  const remove = useCallback(() => { deleteImageGeneratorElement(excalidrawApi, elementId); onClose(); }, [excalidrawApi, elementId, onClose]);
  const modelState = useGeneratorModelState("image", data, update);
  const credit = useMemo(() => resolveCanvasGenerationCreditState(
    modelState.selectedModel?.raw,
    buildCanvasGenerationParameters("image", { ...data, prompt }),
    modelState.creditBalance,
  ), [data, modelState.creditBalance, modelState.selectedModel, prompt]);
  const inputUpdated = Boolean(data.inputUpdated || (hasCanvasGenerationBaseline(data) && prompt !== (data.prompt ?? "")));
  const generationDisabled = generating || credit.insufficient || (!prompt.trim() && !data.hasUpstreamPrompt) || !modelState.ready;
  const failureVisible = data.status === "failed" && data.generationNoticeDismissed !== "failed";
  const submit = useCallback(() => Promise.resolve(onGenerate?.({
    ...data,
    prompt,
    model: modelState.selectedModel?.code,
    type: "image-generator",
    elementId,
  })).catch(() => undefined), [data, elementId, modelState.selectedModel?.code, onGenerate, prompt]);
  useEffect(() => {
    if (!inputUpdated) setStaleActionsOpen(false);
  }, [inputUpdated]);

  return createPortal(
    <PanelFrame title="图片生成" kind="image" position={position} panelRef={panelRef} onClose={onClose} onDelete={remove} inputUpdated={inputUpdated} inputUpdatedOpen={staleActionsOpen} onInputUpdatedClick={() => setStaleActionsOpen((open) => !open)}>
      <label className="loomic-field">
        <span>提示词</span>
        <textarea
          value={prompt}
          rows={3}
          placeholder="描述你想生成的画面"
          onChange={(event) => setPrompt(event.target.value)}
          onBlur={() => update(markCanvasGeneratorInputUpdated(data, { prompt }))}
        />
      </label>
      <ReferenceImages images={data.inputImages ?? []} onArchiveImage={onArchiveImage} onArchiveError={() => excalidrawApi?.setToast?.({ message: "参考图上传失败，请重试。", closable: true })} onChange={(inputImages) => update(markCanvasGeneratorInputUpdated(data, { inputImages }))} />
      <GeneratorModelControls kind="image" data={data} update={update} changeRatio={changeRatio} state={modelState} />
      <GenerationCreditNotice credit={credit} balanceStatus={modelState.creditStatus} />
      {staleActionsOpen ? (
        <CanvasGenerationNotice
          message="输入已更新，更新生成后将使用当前提示词、参考素材和模型参数。"
          primaryLabel={<>更新生成{credit.estimatedCredits !== null ? <span>{credit.estimatedCredits}</span> : null}</>}
          disabled={generationDisabled}
          onPrimary={() => void submit()}
          onClose={() => {
            setStaleActionsOpen(false);
          }}
        />
      ) : failureVisible ? (
        <CanvasGenerationNotice
          tone="error"
          message={generationError || data.error || "图片生成失败，请检查输入后重新生成。"}
          primaryLabel="重新生成"
          disabled={generationDisabled}
          onPrimary={() => void submit()}
          onClose={() => update({ generationNoticeDismissed: "failed" })}
        />
      ) : (
        <button className="loomic-generate-button" type="button" disabled={generationDisabled} onClick={() => void submit()}>{generating ? "生成中…" : inputUpdated ? "更新生成" : data.status === "completed" || data.status === "failed" ? "重新生成图片" : "生成图片"}</button>
      )}
    </PanelFrame>,
    document.body,
  );
}

export function VideoGeneratorPanel({ elementId, elementBounds, data, excalidrawApi, canvasScrollZoom, onClose, onGenerate, onArchiveImage, generating = false, generationError = "" }) {
  const panelRef = useRef(null);
  const position = useFloatingPosition(elementBounds, canvasScrollZoom, panelRef);
  const [prompt, setPrompt] = useState(data.prompt ?? "");
  const [staleActionsOpen, setStaleActionsOpen] = useState(false);
  useEffect(() => setPrompt(data.prompt ?? ""), [data.prompt]);
  const update = useCallback((updates) => updateVideoGeneratorElement(excalidrawApi, elementId, updates), [excalidrawApi, elementId]);
  const changeRatio = useCallback((ratio) => resizeVideoGeneratorElement(excalidrawApi, elementId, ratio), [excalidrawApi, elementId]);
  const remove = useCallback(() => { deleteVideoGeneratorElement(excalidrawApi, elementId); onClose(); }, [excalidrawApi, elementId, onClose]);
  const modelState = useGeneratorModelState("video", data, update);
  const credit = useMemo(() => resolveCanvasGenerationCreditState(
    modelState.selectedModel?.raw,
    buildCanvasGenerationParameters("video", { ...data, prompt }),
    modelState.creditBalance,
  ), [data, modelState.creditBalance, modelState.selectedModel, prompt]);
  const inputUpdated = Boolean(data.inputUpdated || (hasCanvasGenerationBaseline(data) && prompt !== (data.prompt ?? "")));
  const generationDisabled = generating || credit.insufficient || (!prompt.trim() && !data.hasUpstreamPrompt) || !modelState.ready;
  const failureVisible = data.status === "failed" && data.generationNoticeDismissed !== "failed";
  const submit = useCallback(() => Promise.resolve(onGenerate?.({
    ...data,
    prompt,
    model: modelState.selectedModel?.code,
    type: "video-generator",
    elementId,
  })).catch(() => undefined), [data, elementId, modelState.selectedModel?.code, onGenerate, prompt]);
  useEffect(() => {
    if (!inputUpdated) setStaleActionsOpen(false);
  }, [inputUpdated]);

  return createPortal(
    <PanelFrame title="视频生成" kind="video" position={position} panelRef={panelRef} onClose={onClose} onDelete={remove} inputUpdated={inputUpdated} inputUpdatedOpen={staleActionsOpen} onInputUpdatedClick={() => setStaleActionsOpen((open) => !open)}>
      <label className="loomic-field">
        <span>提示词</span>
        <textarea value={prompt} rows={3} placeholder="描述镜头内容与运动" onChange={(event) => setPrompt(event.target.value)} onBlur={() => update(markCanvasGeneratorInputUpdated(data, { prompt }))} />
      </label>
      <ReferenceImages images={data.inputImages ?? []} onArchiveImage={onArchiveImage} onArchiveError={() => excalidrawApi?.setToast?.({ message: "参考图上传失败，请重试。", closable: true })} limit={2} labels={["首帧", "尾帧"]} onChange={(inputImages) => update(markCanvasGeneratorInputUpdated(data, { inputImages }))} />
      <GeneratorModelControls kind="video" data={data} update={update} changeRatio={changeRatio} state={modelState} />
      <GenerationCreditNotice credit={credit} balanceStatus={modelState.creditStatus} />
      {staleActionsOpen ? (
        <CanvasGenerationNotice
          message="输入已更新，更新生成后将使用当前提示词、首尾帧和模型参数。"
          primaryLabel={<>更新生成{credit.estimatedCredits !== null ? <span>{credit.estimatedCredits}</span> : null}</>}
          disabled={generationDisabled}
          onPrimary={() => void submit()}
          onClose={() => {
            setStaleActionsOpen(false);
          }}
        />
      ) : failureVisible ? (
        <CanvasGenerationNotice
          tone="error"
          message={generationError || data.error || "视频生成失败，请检查输入后重新生成。"}
          primaryLabel="重新生成"
          disabled={generationDisabled}
          onPrimary={() => void submit()}
          onClose={() => update({ generationNoticeDismissed: "failed" })}
        />
      ) : (
        <button className="loomic-generate-button" type="button" disabled={generationDisabled} onClick={() => void submit()}>{generating ? "生成中…" : inputUpdated ? "更新生成" : data.status === "completed" || data.status === "failed" ? "重新生成视频" : "生成视频"}</button>
      )}
    </PanelFrame>,
    document.body,
  );
}
