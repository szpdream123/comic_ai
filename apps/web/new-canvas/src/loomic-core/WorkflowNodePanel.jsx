import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioLines, Cloud, ExternalLink, Film, HardDrive, LoaderCircle, Play, RefreshCw, Square, Trash2, X } from "lucide-react";
import { CanvasGenerationNotice } from "./CanvasGenerationNotice.jsx";
import {
  collectCanvasVideoCompositionClips,
  executeCanvasVideoComposition,
} from "./canvas-video-composition.js";
import {
  canvasDirectorResultPatch,
  findLatestCanvasDirectorResult,
} from "./canvas-director-execution.js";
import { buildCanvasGenerationParameters, collectUpstreamCanvasInput } from "./canvas-generation.js";
import {
  canvasGenerationCreditMessage,
  resolveCanvasGenerationCreditState,
} from "./canvas-generation-credits.js";
import { useCanvasGenerationConfig } from "./CanvasGenerationConfigContext.jsx";
import {
  buildCanvasModelSelectionPatch,
  markCanvasGeneratorInputUpdated,
  resolveCanvasGenerationModel,
  resolveCanvasGenerationModels,
} from "./canvas-generation-models.js";
import {
  deleteWorkflowNodeElement,
  getWorkflowNodeDefinition,
  updateWorkflowNodeElement,
} from "./workflow-node-elements.js";

const AUDIO_EFFECTS = [
  ["none", "无"],
  ["spacious_echo", "空旷回音"],
  ["hall_broadcast", "礼堂广播"],
  ["telephone", "电话失真"],
  ["electronic", "电音"],
];

function audioOptions(model, key) {
  const parameter = model?.parameterSchema?.[key];
  const configured = Array.isArray(parameter?.options) && parameter.options.length
    ? parameter.options
    : Array.isArray(parameter?.enum) ? parameter.enum : [];
  const fallback = key === "voice"
    ? model?.supportedVoices ?? model?.voices ?? []
    : [];
  return (configured.length ? configured : fallback).map((item) => {
    if (item && typeof item === "object") {
      const value = String(item.value ?? item.providerValue ?? item.id ?? "").trim();
      return value ? { value, label: String(item.label ?? item.name ?? value) } : null;
    }
    const value = String(item ?? "").trim();
    return value ? { value, label: value } : null;
  }).filter(Boolean);
}

function supportsAudioParameter(model, key) {
  if (Object.prototype.hasOwnProperty.call(model?.parameterSchema ?? {}, key)) return true;
  const capabilities = model?.capabilities;
  if (Array.isArray(capabilities)) return capabilities.some((value) => String(value).trim() === key);
  if (!capabilities || typeof capabilities !== "object") return false;
  if (capabilities[key] === true) return true;
  const parameters = Array.isArray(capabilities.parameters) ? capabilities.parameters : [];
  return parameters.some((value) => String(value).trim() === key);
}

function audioNumberControl(model, key, label, fallback) {
  const parameter = model?.parameterSchema?.[key] ?? {};
  const numberOr = (value, defaultValue) => Number.isFinite(Number(value)) ? Number(value) : defaultValue;
  return {
    key,
    label: String(parameter.label ?? parameter.title ?? label),
    min: numberOr(parameter.minimum ?? parameter.min, fallback.min),
    max: numberOr(parameter.maximum ?? parameter.max, fallback.max),
    step: numberOr(parameter.step, fallback.step),
    defaultValue: numberOr(model?.defaultParams?.[key] ?? parameter.default, fallback.defaultValue),
  };
}

function useFloatingPosition(bounds, viewport, panelRef) {
  const [position, setPosition] = useState({ left: 16, top: 16, visibility: "hidden" });
  useEffect(() => {
    if (!bounds) return;
    const zoom = viewport.zoom || 1;
    const canvas = document.querySelector(".loomic-canvas-root")?.getBoundingClientRect();
    const elementLeft = (canvas?.left ?? 0) + (bounds.x + viewport.scrollX) * zoom;
    const elementTop = (canvas?.top ?? 0) + (bounds.y + viewport.scrollY) * zoom;
    const elementWidth = bounds.width * zoom;
    const elementHeight = bounds.height * zoom;
    const panelWidth = panelRef.current?.offsetWidth ?? 350;
    const panelHeight = panelRef.current?.offsetHeight ?? 250;
    const below = elementTop + elementHeight + 12;
    const top = below + panelHeight < window.innerHeight - 12
      ? below
      : Math.max(12, elementTop - panelHeight - 12);
    setPosition({
      left: Math.max(12, Math.min(elementLeft + elementWidth / 2 - panelWidth / 2, window.innerWidth - panelWidth - 12)),
      top,
      visibility: "visible",
    });
  }, [bounds, viewport]);
  return position;
}

export function WorkflowNodePanel({
  elementId,
  elementBounds,
  data,
  excalidrawApi,
  canvasScrollZoom,
  canvasProjectId,
  onCompose,
  onGenerate,
  onCancelGeneration,
  onPersistCanvas,
  onClose,
}) {
  const panelRef = useRef(null);
  const audioAbortRef = useRef(null);
  const [compositionSubmitting, setCompositionSubmitting] = useState(false);
  const [audioSubmitting, setAudioSubmitting] = useState(false);
  const [directorSubmitting, setDirectorSubmitting] = useState(false);
  const [directorRecovering, setDirectorRecovering] = useState(false);
  const [staleNoticeOpen, setStaleNoticeOpen] = useState(Boolean(data?.inputUpdated));
  const directorRecoveryRef = useRef("");
  const generationConfig = useCanvasGenerationConfig();
  const definition = getWorkflowNodeDefinition(data?.type);
  const position = useFloatingPosition(elementBounds, canvasScrollZoom, panelRef);
  const update = useCallback((updates) => updateWorkflowNodeElement(excalidrawApi, elementId, updates), [excalidrawApi, elementId]);
  const director = data?.type === "director-node";
  const audioGenerator = data?.type === "audio-node" && !["upload", "generated"].includes(data?.sourceKind);
  const audioModels = useMemo(
    () => resolveCanvasGenerationModels(generationConfig.config, "audio"),
    [generationConfig.config],
  );
  const selectedAudioModel = useMemo(
    () => resolveCanvasGenerationModel(generationConfig.config, "audio", data?.model),
    [data?.model, generationConfig.config],
  );
  const configuredAudioModel = Boolean(selectedAudioModel && audioModels.some((model) => model.code === data?.model));
  const audioReady = audioGenerator && generationConfig.status === "ready" && configuredAudioModel;
  const audioVoiceRequired = Boolean(selectedAudioModel?.raw?.parameterSchema?.voice?.required);
  const audioVoiceValue = String(data?.parameters?.voice ?? selectedAudioModel?.raw?.defaultParams?.voice ?? "");
  const audioTextLimit = Number(selectedAudioModel?.raw?.parameterSchema?.text?.maxLength) || 50000;
  const audioCredit = useMemo(() => resolveCanvasGenerationCreditState(
    selectedAudioModel?.raw,
    buildCanvasGenerationParameters("audio", data ?? {}),
    generationConfig.creditBalance,
  ), [data, generationConfig.creditBalance, selectedAudioModel]);
  useEffect(() => {
    setCompositionSubmitting(false);
    setAudioSubmitting(false);
    setDirectorSubmitting(false);
    setDirectorRecovering(false);
    directorRecoveryRef.current = "";
    audioAbortRef.current?.abort();
    audioAbortRef.current = null;
  }, [elementId]);
  useEffect(() => {
    if (!audioGenerator || generationConfig.status !== "ready" || !selectedAudioModel || configuredAudioModel) return;
    update(buildCanvasModelSelectionPatch(data, selectedAudioModel.raw, "audio"));
  }, [audioGenerator, configuredAudioModel, data, generationConfig.status, selectedAudioModel, update]);
  useEffect(() => {
    const client = generationConfig.api;
    const recoveryKey = `${canvasProjectId ?? ""}:${elementId}`;
    if (!director || !canvasProjectId || data?.directorResult || typeof client?.listCanvasNodeRuns !== "function" || directorRecoveryRef.current === recoveryKey) return undefined;
    directorRecoveryRef.current = recoveryKey;
    let active = true;
    setDirectorRecovering(true);
    Promise.resolve(client.listCanvasNodeRuns(canvasProjectId, elementId))
      .then(async (history) => {
        if (!active) return;
        const recovered = findLatestCanvasDirectorResult(history);
        if (!recovered) return;
        update(canvasDirectorResultPatch(recovered));
        await onPersistCanvas?.();
      })
      .catch(() => undefined)
      .finally(() => { if (active) setDirectorRecovering(false); });
    return () => { active = false; };
  }, [canvasProjectId, data?.directorResult, director, elementId, generationConfig.api, onPersistCanvas, update]);
  if (!definition) return null;
  const textField = definition.textField;
  const audioMedia = data?.type === "audio-node" && ["upload", "generated"].includes(data?.sourceKind) && data?.mediaUrl;
  const composition = data?.type === "video-composition-node";
  const compositionStatus = ["running", "failed", "completed"].includes(data?.status) ? data.status : "ready";
  const audioStatus = ["running", "failed", "completed", "canceled"].includes(data?.status) ? data.status : audioReady ? "ready" : "unavailable";
  const directorStatus = ["running", "failed", "completed"].includes(data?.status) ? data.status : "ready";
  const availability = audioMedia ? "ready" : composition ? compositionStatus : audioGenerator ? audioStatus : director ? directorStatus : definition.availability;
  const availabilityLabel = audioMedia
    ? data?.sourceKind === "generated" ? "已生成" : "已上传"
    : compositionStatus === "running"
      ? "合成中"
      : compositionStatus === "failed"
        ? "失败"
        : compositionStatus === "completed"
          ? "已完成"
          : audioGenerator
            ? audioStatus === "running" ? "生成中" : audioStatus === "failed" ? "失败" : audioStatus === "completed" ? "已完成" : audioStatus === "canceled" ? "已取消" : audioReady ? "可执行" : "不可执行"
            : director
              ? directorRecovering ? "恢复中" : data?.directorReplayPending ? "待恢复" : directorStatus === "running" ? "运行中" : directorStatus === "failed" ? "失败" : directorStatus === "completed" ? "已完成" : "可执行"
              : definition.availabilityLabel;
  const compositionClips = composition
    ? collectCanvasVideoCompositionClips(excalidrawApi?.getSceneElements?.() ?? [], elementId, data)
    : [];
  const compositionRecoverable = composition
    && data?.status === "running"
    && Boolean(String(data?.compositionRequestId ?? "").trim());
  const failureNoticeVisible = data?.status === "failed" && data?.generationNoticeDismissed !== "failed";

  useEffect(() => {
    setStaleNoticeOpen(Boolean(data?.inputUpdated));
  }, [data?.inputUpdated, elementId]);

  const remove = () => {
    deleteWorkflowNodeElement(excalidrawApi, elementId);
    onClose?.();
  };
  const updateAudioParameter = (key, value) => update(markCanvasGeneratorInputUpdated(data, {
    parameters: { ...(data?.parameters ?? {}), [key]: value },
  }));
  const updateDirectorInstructions = (instructions) => update({
    instructions,
    status: "ready",
    inputUpdated: Boolean(data?.directorResult),
    error: undefined,
  });
  const runAudio = async () => {
    if (audioSubmitting || !audioReady) return;
    const controller = new AbortController();
    audioAbortRef.current = controller;
    setAudioSubmitting(true);
    try {
      await onGenerate?.({
        ...data,
        prompt: String(data?.prompt ?? "").slice(0, audioTextLimit),
        model: selectedAudioModel.code,
        type: "audio-node",
        elementId,
      }, { signal: controller.signal });
    } catch (error) {
      if (error?.code !== "canvas_generation_canceled") {
        excalidrawApi?.setToast?.({ message: error instanceof Error ? error.message : "音频生成失败。", closable: true });
      }
    } finally {
      if (audioAbortRef.current === controller) audioAbortRef.current = null;
      setAudioSubmitting(false);
    }
  };
  const cancelAudio = async () => {
    if (audioAbortRef.current) {
      audioAbortRef.current.abort();
      return;
    }
    const taskId = String(data?.taskId ?? "").trim();
    if (!taskId || typeof onCancelGeneration !== "function") return;
    try {
      const result = await onCancelGeneration(taskId);
      if (["canceled", "already_canceled"].includes(String(result?.status ?? ""))) {
        update({ status: "canceled", error: "生成任务已取消。", cancellationConfirmed: true });
      }
    } catch (error) {
      excalidrawApi?.setToast?.({ message: error instanceof Error ? error.message : "远端任务暂时无法取消，稍后可刷新恢复结果。", closable: true });
    }
  };
  const setClipDuration = (nodeId, value) => update({
    clipDurations: {
      ...(data?.clipDurations ?? {}),
      [nodeId]: Math.max(0.1, Number(value) || 0.1),
    },
  });
  const runComposition = async () => {
    if (compositionSubmitting) return;
    setCompositionSubmitting(true);
    update({ generationNoticeDismissed: null });
    try {
      await executeCanvasVideoComposition({
        api: excalidrawApi,
        nodeId: elementId,
        canvasProjectId,
        onCompose,
        onPersist: onPersistCanvas,
      });
    } catch (error) {
      excalidrawApi?.setToast?.({ message: error instanceof Error ? error.message : "视频合成失败。", closable: true });
    } finally {
      setCompositionSubmitting(false);
    }
  };
  const runDirector = async () => {
    if (directorSubmitting || directorRecovering || typeof onGenerate !== "function") return;
    const upstream = collectUpstreamCanvasInput(
      excalidrawApi?.getSceneElements?.() ?? [],
      excalidrawApi?.getFiles?.() ?? {},
      elementId,
    );
    if (!String(data?.instructions ?? "").trim() && !upstream.upstreamNodeIds.length) {
      excalidrawApi?.setToast?.({ message: "请输入导演要求或连接上游素材。", closable: true });
      return;
    }
    setDirectorSubmitting(true);
    try {
      await onGenerate({ ...data, type: "director-node", elementId });
      await onPersistCanvas?.();
    } catch (error) {
      await onPersistCanvas?.();
      excalidrawApi?.setToast?.({ message: error instanceof Error ? error.message : "导演指令生成失败。", closable: true });
    } finally {
      setDirectorSubmitting(false);
    }
  };

  return (
    <aside
      ref={panelRef}
      className="loomic-generator-panel loomic-workflow-node-panel"
      data-theme="light"
      style={position}
      aria-label={`${definition.title}节点配置`}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <header>
        <span className={`loomic-kind-dot is-${definition.nodeType}`} />
        <strong>{definition.title}</strong>
        <span className={`loomic-node-availability is-${availability}`}>{availabilityLabel}</span>
        <button type="button" className="loomic-icon-button" title="删除节点" aria-label="删除节点" onClick={remove}><Trash2 aria-hidden="true" /></button>
        <button type="button" className="loomic-icon-button" title="关闭" aria-label="关闭节点配置" onClick={onClose}><X aria-hidden="true" /></button>
      </header>
      <label className="loomic-field">
        <span>节点名称</span>
        <input value={data?.title ?? definition.title} onChange={(event) => update({ title: event.target.value })} />
      </label>
      {textField && !composition && !audioGenerator ? (
        <label className="loomic-field">
          <span>{definition.editorLabel}</span>
          <textarea
            value={data?.[textField] ?? ""}
            disabled={director && (directorSubmitting || directorRecovering || data?.directorReplayPending)}
            placeholder={`输入${definition.editorLabel}`}
            onChange={(event) => director ? updateDirectorInstructions(event.target.value) : update({ [textField]: event.target.value })}
          />
        </label>
      ) : null}
      {director ? (
        <section className="loomic-director-generator" aria-label="导演指令生成">
          {data?.directorResult ? (
            <div className={`loomic-director-result ${data?.inputUpdated ? "is-stale" : ""}`} aria-label="导演指令结果">
              <strong>导演指令</strong>
              <p>{typeof data.directorResult === "object"
                ? data.directorResult.text ?? data.directorResult.directorInstructions ?? data.directorResult.instructions ?? data.resultText
                : data.directorResult}</p>
              {data?.inputUpdated ? <small>导演要求已更新，重新生成后下游将使用新指令。</small> : null}
            </div>
          ) : null}
          {data?.inputUpdated && staleNoticeOpen ? (
            <CanvasGenerationNotice
              message="输入已更新，更新生成后下游节点将使用新的导演指令。"
              primaryLabel="更新生成"
              disabled={directorSubmitting || directorRecovering || !canvasProjectId || typeof onGenerate !== "function"}
              onPrimary={() => void runDirector()}
              onClose={() => setStaleNoticeOpen(false)}
            />
          ) : failureNoticeVisible ? (
            <CanvasGenerationNotice
              tone="error"
              message={data?.error || "导演指令生成失败，请检查输入后重新生成。"}
              primaryLabel="重新生成"
              disabled={directorSubmitting || directorRecovering || !canvasProjectId || typeof onGenerate !== "function"}
              onPrimary={() => void runDirector()}
              onClose={() => update({ generationNoticeDismissed: "failed" })}
            />
          ) : <button
            type="button"
            className="loomic-generate-button"
            disabled={directorSubmitting || directorRecovering || !canvasProjectId || typeof onGenerate !== "function"}
            onClick={() => void runDirector()}
          >
            {directorSubmitting
              ? <><LoaderCircle className="is-spinning" aria-hidden="true" />运行中…</>
              : directorRecovering
                ? <><LoaderCircle className="is-spinning" aria-hidden="true" />恢复结果…</>
                : data?.inputUpdated
                  ? <><RefreshCw aria-hidden="true" />更新生成</>
                : data?.directorReplayPending
                  ? <><RefreshCw aria-hidden="true" />恢复运行结果</>
                  : data?.status === "running"
                    ? <><RefreshCw aria-hidden="true" />检查运行结果</>
                : data?.status === "failed" || data?.directorResult
                  ? <><RefreshCw aria-hidden="true" />重新生成</>
                  : <><Play aria-hidden="true" />生成导演指令</>}
          </button>}
          {!canvasProjectId ? <p className="loomic-composition-hint">画布同步到云端后可执行导演台。</p> : null}
        </section>
      ) : composition ? (
        compositionClips.length ? (
          <section className="loomic-composition-config" aria-label="视频合成配置">
            <div className="loomic-composition-summary"><Film aria-hidden="true" /><strong>{compositionClips.length} 个连接片段</strong><span>{compositionClips.filter((clip) => clip.storageObjectId).length}/{compositionClips.length} 已归档</span></div>
            <div className="loomic-composition-output-grid">
              <label className="loomic-field">
                <span>分辨率</span>
                <select value={`${data?.width ?? 1280}x${data?.height ?? 720}`} onChange={(event) => {
                  const [width, height] = event.target.value.split("x").map(Number);
                  update({ width, height });
                }}>
                  <option value="1280x720">1280 × 720</option>
                  <option value="1920x1080">1920 × 1080</option>
                  <option value="720x1280">720 × 1280</option>
                  <option value="1080x1920">1080 × 1920</option>
                </select>
              </label>
              <label className="loomic-field">
                <span>帧率</span>
                <select value={data?.fps ?? 24} onChange={(event) => update({ fps: Number(event.target.value) })}>
                  <option value="24">24 fps</option>
                  <option value="25">25 fps</option>
                  <option value="30">30 fps</option>
                </select>
              </label>
            </div>
            <label className="loomic-field">
              <span>图片默认时长</span>
              <input type="number" min="0.1" max="60" step="0.1" value={data?.imageDurationSeconds ?? 3} onChange={(event) => update({ imageDurationSeconds: Math.max(0.1, Number(event.target.value) || 0.1) })} />
            </label>
            <div className="loomic-composition-clips" aria-label="合成片段">
              {compositionClips.map((clip, index) => (
                <label className={`loomic-composition-clip ${clip.storageObjectId ? "is-ready" : "is-missing"}`} key={clip.nodeId}>
                  <span><strong>{index + 1}. {clip.title}</strong><small>{clip.kind === "image" ? "图片" : "视频"}{clip.storageObjectId ? " · 已归档" : " · 未归档"}</small></span>
                  <input aria-label={`${clip.title}时长`} type="number" min="0.1" max="3600" step="0.1" value={clip.durationSeconds} onChange={(event) => setClipDuration(clip.nodeId, event.target.value)} />
                  <em>秒</em>
                </label>
              ))}
            </div>
            {data?.status === "completed" && data?.resultUrl ? (
              <div className="loomic-composition-result">
                <video controls preload="metadata" src={data.resultUrl} />
                <span>{data.resultWidth} × {data.resultHeight} · {data.resultFps} fps · {data.resultDurationSeconds} 秒</span>
              </div>
            ) : null}
            {failureNoticeVisible ? (
              <CanvasGenerationNotice
                tone="error"
                message={data?.error || "视频合成失败，请检查已归档片段后重新生成。"}
                primaryLabel="重新生成"
                disabled={compositionSubmitting || !canvasProjectId || compositionClips.some((clip) => !clip.storageObjectId)}
                onPrimary={() => void runComposition()}
                onClose={() => update({ generationNoticeDismissed: "failed" })}
              />
            ) : <button
              type="button"
              className="loomic-generate-button"
              disabled={compositionSubmitting || !canvasProjectId || compositionClips.some((clip) => !clip.storageObjectId)}
              onClick={() => void runComposition()}
            >
              {compositionSubmitting
                ? <><LoaderCircle className="is-spinning" aria-hidden="true" />合成中…</>
                : compositionRecoverable
                  ? <><Play aria-hidden="true" />恢复合成结果</>
                  : <><Play aria-hidden="true" />合成视频</>}
            </button>}
            {!canvasProjectId ? <p className="loomic-composition-hint">画布同步到云端后可执行合成。</p> : null}
          </section>
        ) : (
          <div className="loomic-workflow-capability is-ready" role="status">
            <strong>连接图片或视频节点后操作</strong>
            <span>合成将按连接顺序读取已归档片段。</span>
          </div>
        )
      ) : audioGenerator ? (
        <section className="loomic-audio-generator" aria-label="音频生成配置">
          <label className="loomic-field loomic-audio-text">
            <span>文本 <em>{String(data?.prompt ?? "").length}/{audioTextLimit}</em></span>
            <textarea
              value={data?.prompt ?? ""}
              maxLength={audioTextLimit}
              rows={5}
              placeholder="输入要转换为语音的文本"
              onChange={(event) => update(markCanvasGeneratorInputUpdated(data, { prompt: event.target.value }))}
            />
          </label>
          {generationConfig.status === "loading" || generationConfig.status === "idle" ? (
            <p className="loomic-model-status">正在检查音频模型…</p>
          ) : generationConfig.status === "error" ? (
            <div className="loomic-model-status is-error">
              <span>{generationConfig.error || "音频模型配置加载失败"}</span>
              <button type="button" title="重新加载模型" onClick={generationConfig.reload}><RefreshCw aria-hidden="true" /></button>
            </div>
          ) : !audioModels.length || !selectedAudioModel ? (
            <p className="loomic-model-status is-error">后台没有已启用的音频模型，当前节点不会提交生成任务</p>
          ) : (
            <div className="loomic-audio-controls">
              <label className="loomic-field">
                <span>模型</span>
                <select value={selectedAudioModel.code} onChange={(event) => {
                  const model = audioModels.find((item) => item.code === event.target.value);
                  if (model) update(buildCanvasModelSelectionPatch(data, model.raw, "audio"));
                }}>
                  {audioModels.map((model) => <option key={model.code} value={model.code}>{model.label}</option>)}
                </select>
              </label>
              {supportsAudioParameter(selectedAudioModel.raw, "voice") ? (
                <label className="loomic-field">
                  <span>音色</span>
                  {audioOptions(selectedAudioModel.raw, "voice").length ? (
                    <select required={audioVoiceRequired} value={audioVoiceValue} onChange={(event) => updateAudioParameter("voice", event.target.value)}>
                      {!audioVoiceRequired ? <option value="">模型默认音色</option> : null}
                      {audioOptions(selectedAudioModel.raw, "voice").map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  ) : (
                    <input required={audioVoiceRequired} value={audioVoiceValue} placeholder={audioVoiceRequired ? "输入音色标识" : "模型默认音色"} onChange={(event) => updateAudioParameter("voice", event.target.value)} />
                  )}
                </label>
              ) : null}
              {[ ["pause", "智能停顿"], ["interjection", "语气词"], ["intensity", "强度调节"], ["timbre", "音色调节"] ].some(([key]) => supportsAudioParameter(selectedAudioModel.raw, key)) ? (
                <div className="loomic-audio-switches">
                  {[["pause", "智能停顿"], ["interjection", "语气词"], ["intensity", "强度调节"], ["timbre", "音色调节"]].filter(([key]) => supportsAudioParameter(selectedAudioModel.raw, key)).map(([key, label]) => (
                  <label key={key}><input type="checkbox" checked={Boolean(data?.parameters?.[key])} onChange={(event) => updateAudioParameter(key, event.target.checked)} /><span>{label}</span></label>
                  ))}
                </div>
              ) : null}
              {[
                audioNumberControl(selectedAudioModel.raw, "rate", "语速", { min: 0.5, max: 2, step: 0.05, defaultValue: 1 }),
                audioNumberControl(selectedAudioModel.raw, "pitch", "声调（音高调节）", { min: 0.5, max: 2, step: 0.05, defaultValue: 1 }),
                audioNumberControl(selectedAudioModel.raw, "volume", "音量", { min: 0, max: 100, step: 1, defaultValue: 50 }),
              ].filter(({ key }) => supportsAudioParameter(selectedAudioModel.raw, key)).map(({ key, label, min, max, step, defaultValue }) => {
                const value = Number(data?.parameters?.[key] ?? defaultValue);
                return (
                  <label className="loomic-audio-range" key={key}>
                    <span>{label}<output>{value}</output></span>
                    <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => updateAudioParameter(key, Number(event.target.value))} />
                  </label>
                );
              })}
              {supportsAudioParameter(selectedAudioModel.raw, "effect") ? (
                <label className="loomic-field">
                  <span>音效</span>
                  <select value={String(data?.parameters?.effect ?? "none")} onChange={(event) => updateAudioParameter("effect", event.target.value)}>
                    {AUDIO_EFFECTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
              ) : null}
            </div>
          )}
          <p className={`loomic-generation-credit ${audioCredit.insufficient ? "is-insufficient" : ""}`} role={audioCredit.insufficient ? "alert" : "status"}>{canvasGenerationCreditMessage(audioCredit, generationConfig.creditStatus)}</p>
          {data?.status === "completed" && data?.resultUrl ? (
            <div className="loomic-audio-result"><audio controls preload="metadata" src={data.resultUrl} /><span>已归档，可从画布继续连接复用</span></div>
          ) : null}
          {data?.status === "running" ? (
            <button type="button" className="loomic-audio-cancel" disabled={!audioAbortRef.current && (!data?.taskId || typeof onCancelGeneration !== "function")} onClick={() => void cancelAudio()}><Square aria-hidden="true" />取消生成</button>
          ) : data?.inputUpdated && staleNoticeOpen ? (
            <CanvasGenerationNotice
              message="输入已更新，更新生成后将使用当前文本、音色和音频参数。"
              primaryLabel={<>更新生成{audioCredit.estimatedCredits !== null ? <span>{audioCredit.estimatedCredits}</span> : null}</>}
              disabled={audioSubmitting || audioCredit.insufficient || (!String(data?.prompt ?? "").trim() && !data?.hasUpstreamPrompt) || !audioReady || (audioVoiceRequired && !audioVoiceValue) || typeof onGenerate !== "function"}
              onPrimary={() => void runAudio()}
              onClose={() => setStaleNoticeOpen(false)}
            />
          ) : failureNoticeVisible ? (
            <CanvasGenerationNotice
              tone="error"
              message={data?.error || "音频生成失败，请检查输入后重新生成。"}
              primaryLabel="重新生成"
              disabled={audioSubmitting || audioCredit.insufficient || (!String(data?.prompt ?? "").trim() && !data?.hasUpstreamPrompt) || !audioReady || (audioVoiceRequired && !audioVoiceValue) || typeof onGenerate !== "function"}
              onPrimary={() => void runAudio()}
              onClose={() => update({ generationNoticeDismissed: "failed" })}
            />
          ) : (
            <button
              type="button"
              className="loomic-generate-button"
              disabled={audioSubmitting || audioCredit.insufficient || (!String(data?.prompt ?? "").trim() && !data?.hasUpstreamPrompt) || !audioReady || (audioVoiceRequired && !audioVoiceValue) || typeof onGenerate !== "function"}
              onClick={() => void runAudio()}
            >
              {audioSubmitting
                ? <><LoaderCircle className="is-spinning" aria-hidden="true" />生成中…</>
                : data?.inputUpdated
                  ? <><RefreshCw aria-hidden="true" />更新生成</>
                  : <><Play aria-hidden="true" />生成音频</>}
            </button>
          )}
        </section>
      ) : audioMedia ? (
        <section className="loomic-uploaded-audio" aria-label="上传音频">
          <audio controls preload="metadata" src={data.mediaUrl} />
          <div><AudioLines aria-hidden="true" /><strong title={data.fileName || data.title}>{data.fileName || data.title}</strong>{data.durationSeconds ? <span>{data.durationSeconds} 秒</span> : null}</div>
          <p>{data.cloudArchiveStatus === "archived" ? <><Cloud aria-hidden="true" />已归档到云端</> : <><HardDrive aria-hidden="true" />仅保存在当前画布</>}</p>
        </section>
      ) : (
        <div className={`loomic-workflow-capability is-${definition.availability}`} role="status">
          <strong>{definition.availability === "ready" ? "无需运行" : "画布内不可执行"}</strong>
          <span>{definition.unavailableReason}</span>
        </div>
      )}
      {director ? (
        <button type="button" className="loomic-workflow-external" onClick={() => window.location.assign("/#director")}>
          <ExternalLink aria-hidden="true" />打开导演台
        </button>
      ) : null}
    </aside>
  );
}
