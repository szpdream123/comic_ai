import { insertImageOnCanvas, insertVideoOnCanvas } from "./canvas-elements.js";
import { canvasDirectorResultPatch } from "./canvas-director-execution.js";
import { buildCanvasGenerationParameters, collectUpstreamCanvasInput } from "./canvas-generation.js";
import { canvasGenerationCreditMessage, resolveCanvasGenerationCreditState } from "./canvas-generation-credits.js";
import { resolveCanvasGenerationModel } from "./canvas-generation-models.js";
import { collectCanvasWorkflowEdges, findCanvasWorkflowDependencyCycle } from "./canvas-workflow-edges.js";
import { updateImageGeneratorElement } from "./image-generator-elements.js";
import { updateVideoGeneratorElement } from "./video-generator-elements.js";
import { createUploadedAudioNodeElement, updateWorkflowNodeElement } from "./workflow-node-elements.js";

const GENERATOR_TYPES = new Set(["image-generator", "video-generator", "audio-node", "director-node"]);
const SERVER_RECOVERY_STATUSES = new Set(["created", "queued", "running"]);
const SERVER_TERMINAL_STATUSES = new Set(["failed", "canceled", "cancelled", "manual_review_required", "result_unknown"]);
const SERVER_RECOVERY_INPUT_KEYS = [
  "kind",
  "mediaKind",
  "targetType",
  "targetId",
  "prompt",
  "model",
  "parameters",
  "referenceImages",
  "canvasContext",
  "motionPrompt",
  "firstFrameUrl",
  "lastFrameUrl",
  "sourceVideoUrl",
  "referenceAudioUrl",
  "text",
];
const GENERATION_INPUT_KEYS = [
  "type",
  "prompt",
  "instructions",
  "model",
  "modelCode",
  "modelLabel",
  "parameters",
  "parameterValues",
  "aspectRatio",
  "quality",
  "duration",
  "durationSec",
  "resolution",
  "outputCount",
  "inputImages",
  "firstFrameUrl",
  "lastFrameUrl",
  "sourceVideoUrl",
  "referenceAudioUrl",
  "text",
  "voice",
  "format",
  "sampleRate",
  "rate",
  "pitch",
  "volume",
  "motionPrompt",
  "mediaKind",
  "sourceKind",
  "__generationUpstreamInput",
];

function generationKind(type) {
  if (type === "director-node") return "director";
  if (type === "video-generator") return "video";
  if (type === "audio-node") return "audio";
  return "image";
}

function updateGenerator(api, id, type, updates) {
  if (type === "video-generator") updateVideoGeneratorElement(api, id, updates);
  else if (type === "audio-node" || type === "director-node") updateWorkflowNodeElement(api, id, updates);
  else updateImageGeneratorElement(api, id, updates);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function normalizeGenerationInputValue(value) {
  if (Array.isArray(value)) return value.map(normalizeGenerationInputValue);
  if (value && typeof value === "object") {
    const stableObjectId = String(value.storageObjectId ?? value.resultStorageObjectId ?? "").trim();
    if (stableObjectId) return { storageObjectId: stableObjectId };
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalizeGenerationInputValue(value[key])]));
  }
  return value;
}

export function canvasGenerationInputSignature(value) {
  const data = value?.customData && typeof value.customData === "object"
    ? {
        ...value.customData,
        ...(value.__generationUpstreamInput !== undefined
          ? { __generationUpstreamInput: value.__generationUpstreamInput }
          : {}),
      }
    : value ?? {};
  return JSON.stringify(Object.fromEntries(GENERATION_INPUT_KEYS
    .filter((key) => data[key] !== undefined)
    .map((key) => [key, normalizeGenerationInputValue(data[key])] )));
}

export function canvasGenerationInputsMatch(element, request) {
  return canvasGenerationInputSignature(element) === canvasGenerationInputSignature(request);
}

function snapshotGenerationDependencies(api, request) {
  const elements = api?.getSceneElements?.() ?? [];
  return collectUpstreamCanvasInput(elements, api?.getFiles?.() ?? {}, request?.elementId);
}

function currentGenerationInput(element, request, api) {
  if (!request || request.__generationUpstreamInput === undefined) return element;
  return {
    ...element,
    __generationUpstreamInput: snapshotGenerationDependencies(api, request),
  };
}

function createDirectorIdempotencyKey() {
  const randomId = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `canvas-director:${randomId}`;
}

function createGenerationIdempotencyKey(kind) {
  const randomId = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `canvas-${kind}:${randomId}`;
}

function isIndeterminateDirectorError(error) {
  if (["canvas_director_result_invalid", "canvas_director_run_failed"].includes(String(error?.code ?? ""))) return false;
  const status = Number(error?.status ?? 0);
  return !status || status >= 500;
}

function isIndeterminateGenerationError(error) {
  if ([
    "canvas_generation_canceled",
    "canvas_generation_detached",
    "canvas_generation_invalid_input",
  ].includes(String(error?.code ?? ""))) return false;
  const status = Number(error?.status ?? 0);
  return String(error?.message ?? error?.errorCode ?? "") === "request_timeout"
    || error?.name === "TypeError"
    || status >= 500;
}

export function isUnauthenticatedError(error) {
  return Number(error?.status ?? 0) === 401
    || String(error?.errorCode ?? error?.message ?? "") === "unauthenticated";
}

export function collectCanvasGenerationResumeCandidates(elements) {
  return (Array.isArray(elements) ? elements : []).filter((element) => (
    !element?.isDeleted
    && element?.customData?.status === "running"
    && Boolean(String(element?.customData?.taskId ?? "").trim())
    && GENERATOR_TYPES.has(element?.customData?.type)
    && element?.customData?.sourceKind !== "upload"
    && element?.customData?.sourceKind !== "generated"
  ));
}

export function collectCanvasGenerationServerRecoveryCandidates(elements) {
  return (Array.isArray(elements) ? elements : []).filter((element) => {
    const data = element?.customData ?? {};
    const type = String(data.type ?? "");
    return !element?.isDeleted
      && type !== "director-node"
      && GENERATOR_TYPES.has(type)
      && !String(data.taskId ?? "").trim()
      && data.inputUpdated !== true
      && !(data.status === "completed" && (data.resultStorageObjectId || data.resultUrl))
      && !(type === "audio-node" && ["upload", "generated"].includes(data.sourceKind));
  });
}

function normalizeRecoveryUrl(value) {
  const source = String(value ?? "");
  if (!/^(?:https?:\/\/|\/)/i.test(source)) return source;
  try {
    const parsed = new URL(source, "https://canvas.invalid");
    return source.startsWith("/") ? parsed.pathname : `${parsed.origin}${parsed.pathname}`;
  } catch {
    return source;
  }
}

function normalizeRecoveryValue(value) {
  if (value === undefined) return undefined;
  if (typeof value === "string") return normalizeRecoveryUrl(value);
  if (Array.isArray(value)) return value.map(normalizeRecoveryValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().flatMap((key) => {
      const normalized = normalizeRecoveryValue(value[key]);
      return normalized === undefined ? [] : [[key, normalized]];
    }));
  }
  return value;
}

function recoveryInputSignature(input) {
  const normalized = {};
  for (const key of SERVER_RECOVERY_INPUT_KEYS) {
    if (input?.[key] === undefined) continue;
    normalized[key] = normalizeRecoveryValue(input[key]);
  }
  return JSON.stringify(normalized);
}

export function findCanvasGenerationServerRecovery(element, history, currentPayload) {
  const type = String(element?.customData?.type ?? "");
  if (!collectCanvasGenerationServerRecoveryCandidates([element]).length || !currentPayload) return null;
  const latestRun = Array.isArray(history?.runs) ? history.runs[0] : null;
  if (!latestRun || String(latestRun.mediaKind ?? "") !== generationKind(type)) return null;
  if (recoveryInputSignature(latestRun.inputSnapshot) !== recoveryInputSignature(currentPayload)) return null;
  const status = String(latestRun.status ?? "").trim().toLowerCase();
  const taskId = String(latestRun.taskId ?? "").trim();
  if (SERVER_RECOVERY_STATUSES.has(status)) {
    return taskId ? { action: "resume", status, taskId, run: latestRun } : null;
  }
  if (status === "succeeded") {
    return taskId || latestRun.artifacts?.length ? { action: "complete", status, taskId, run: latestRun } : null;
  }
  if (SERVER_TERMINAL_STATUSES.has(status)) return { action: "terminal", status, taskId, run: latestRun };
  return null;
}

export function canvasGenerationResultFromRun(run) {
  const artifacts = (Array.isArray(run?.artifacts) ? run.artifacts : [])
    .slice()
    .sort((left, right) => Number(right?.selectionRole === "current") - Number(left?.selectionRole === "current")
      || Number(Boolean(right?.selected)) - Number(Boolean(left?.selected)))
    .map((artifact) => {
      const metadata = artifact?.metadata && typeof artifact.metadata === "object" ? artifact.metadata : {};
      const artifactKind = String(artifact?.artifactKind ?? metadata.mediaKind ?? metadata.kind ?? "").toLowerCase();
      const url = String(artifact?.url ?? metadata.url ?? metadata.sourceUrl ?? metadata.storageUrl ?? "").trim();
      return {
        ...metadata,
        id: artifact?.id ?? metadata.id,
        artifactKind,
        url,
        storageUrl: String(metadata.storageUrl ?? metadata.sourceUrl ?? url).trim() || url,
        storageObjectId: artifact?.storageObjectId ?? metadata.storageObjectId,
        mimeType: String(metadata.mimeType ?? metadata.contentType ?? (artifactKind === "video" ? "video/mp4" : artifactKind === "audio" ? "audio/mpeg" : "image/png")),
      };
    })
    .filter((artifact) => artifact.url);
  const taskId = String(run?.taskId ?? "").trim();
  return {
    taskId: taskId || null,
    task: { id: taskId || null, status: "succeeded", result: run?.outputSnapshot ?? {} },
    artifact: artifacts[0] ?? null,
    artifacts,
  };
}

export function applyCanvasGenerationServerTerminal(api, element, recovery) {
  const status = recovery?.status === "canceled" || recovery?.status === "cancelled" ? "canceled" : "failed";
  const messages = {
    canceled: "生成任务已在其他设备取消。",
    cancelled: "生成任务已在其他设备取消。",
    manual_review_required: "生成任务需要人工审核，请在历史记录中查看。",
    result_unknown: "生成任务结果未知，请在历史记录中查看。",
    failed: "生成任务已在其他设备失败，请在历史记录中查看。",
  };
  updateGenerator(api, element.id, element.customData.type, {
    status,
    taskId: recovery?.taskId || null,
    error: messages[recovery?.status] ?? messages.failed,
    cancellationConfirmed: status === "canceled",
    pollingDetached: false,
    generationNoticeDismissed: null,
  });
}

export function applyCanvasGenerationMissingRecovery(api, element) {
  const data = element?.customData ?? {};
  if (!api || !element?.id || data.generationReplayPending !== true || String(data.taskId ?? "").trim()) return false;
  updateGenerator(api, element.id, data.type, {
    status: "failed",
    error: "生成提交结果尚未确认，请重试以恢复同一次请求。",
    generationReplayPending: true,
    pollingDetached: false,
    generationNoticeDismissed: null,
  });
  return true;
}

export function buildCanvasNodeGenerationRequest(element) {
  const type = String(element?.customData?.type ?? "");
  if (!element?.id || !GENERATOR_TYPES.has(type) || type === "audio-node" && ["upload", "generated"].includes(element?.customData?.sourceKind)) return null;
  return { ...element.customData, type, elementId: element.id };
}

export function markCanvasNodeGenerationSubmitted(api, request, taskId) {
  const id = String(request?.elementId ?? "");
  const normalizedTaskId = String(taskId ?? "").trim();
  const type = String(request?.type ?? "");
  if (!api || !id || !normalizedTaskId || !GENERATOR_TYPES.has(type)) return false;
  const current = api.getSceneElements?.().find((element) => element.id === id && !element.isDeleted);
  const submittedRequest = request?.__generationUpstreamInput === undefined
    ? { ...request, __generationUpstreamInput: snapshotGenerationDependencies(api, request) }
    : request;
  if (!current || !canvasGenerationInputsMatch(currentGenerationInput(current, submittedRequest, api), submittedRequest)) return false;
  updateGenerator(api, id, type, {
    status: "running",
    taskId: normalizedTaskId,
    generationInputSignature: canvasGenerationInputSignature(submittedRequest),
    staleGenerationTaskId: null,
    error: "",
    inputUpdated: false,
    pollingDetached: false,
    authRequired: false,
    generationReplayPending: false,
    generationNoticeDismissed: null,
  });
  return true;
}

export function markCanvasNodeGenerationInputStale(api, request, staleTaskId = null) {
  const id = String(request?.elementId ?? "");
  const type = String(request?.type ?? "");
  if (!api || !id || !GENERATOR_TYPES.has(type)) return false;
  const current = api.getSceneElements?.().find((element) => element.id === id && !element.isDeleted);
  if (!current) return false;
  const data = current.customData ?? {};
  updateGenerator(api, id, type, {
    status: data.resultUrl || data.resultStorageObjectId || data.status === "completed" ? "completed" : "idle",
    taskId: null,
    staleGenerationTaskId: String(staleTaskId ?? data.taskId ?? "").trim() || data.staleGenerationTaskId || null,
    inputUpdated: true,
    generationReplayPending: false,
    pollingDetached: false,
    authRequired: false,
    error: "",
  });
  return true;
}

function markCanvasNodeGenerationResumeStale(api, request, taskId) {
  const id = String(request?.elementId ?? "");
  const type = String(request?.type ?? "");
  const current = api?.getSceneElements?.().find((element) => element.id === id && !element.isDeleted);
  if (!current || !GENERATOR_TYPES.has(type)) return false;
  const data = current.customData ?? {};
  updateGenerator(api, id, type, {
    status: data.resultUrl || data.resultStorageObjectId ? "completed" : "idle",
    taskId: null,
    staleGenerationTaskId: String(taskId ?? data.taskId ?? "").trim() || null,
    inputUpdated: true,
    generationReplayPending: false,
    pollingDetached: true,
    authRequired: false,
    error: "输入已更新，旧任务结果不会自动应用，可在生成历史中查看。",
  });
  return true;
}

export function buildCanvasWorkflowGenerationPlan(elements) {
  const dependencyCycle = findCanvasWorkflowDependencyCycle(elements);
  if (dependencyCycle) {
    throw Object.assign(new Error("工作流存在循环连接，请断开循环后再运行。"), {
      code: "canvas_workflow_cycle",
      details: dependencyCycle,
    });
  }
  const liveElements = (Array.isArray(elements) ? elements : []).filter((element) => !element?.isDeleted && element?.type !== "arrow");
  const order = new Map(liveElements.map((element, index) => [String(element.id ?? ""), index]));
  const elementById = new Map(liveElements.map((element) => [String(element.id ?? ""), element]));
  const indegree = new Map([...elementById.keys()].map((id) => [id, 0]));
  const outgoing = new Map([...elementById.keys()].map((id) => [id, []]));
  for (const edge of collectCanvasWorkflowEdges(elements)) {
    if (!elementById.has(edge.sourceNodeId) || !elementById.has(edge.targetNodeId)) continue;
    outgoing.get(edge.sourceNodeId).push(edge.targetNodeId);
    indegree.set(edge.targetNodeId, (indegree.get(edge.targetNodeId) ?? 0) + 1);
  }
  const ready = [...indegree.entries()].filter(([, count]) => count === 0).map(([id]) => id);
  ready.sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0));
  const sorted = [];
  while (ready.length) {
    const id = ready.shift();
    sorted.push(id);
    for (const targetId of outgoing.get(id) ?? []) {
      const nextIndegree = (indegree.get(targetId) ?? 1) - 1;
      indegree.set(targetId, nextIndegree);
      if (nextIndegree === 0) {
        ready.push(targetId);
        ready.sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0));
      }
    }
  }
  return sorted.map((id) => buildCanvasNodeGenerationRequest(elementById.get(id))).filter(Boolean);
}

export function createCanvasWorkflowRunQueue({ execute, onChange, initialSnapshot, onSnapshotChange }) {
  const restored = restoreWorkflowQueueSnapshot(initialSnapshot);
  let queue = restored.requests;
  let currentRequest = null;
  let currentAbortController = null;
  let pauseRequested = ["paused", "failed"].includes(restored.state.status);
  let stopRequested = false;
  let disposed = false;
  let snapshotEnabled = true;
  let runningLoop = null;
  let state = restored.state;
  const snapshot = () => ({
    version: 1,
    state: { ...state, failures: state.failures.map((failure) => ({ ...failure })) },
    currentRequest: currentRequest ? { ...currentRequest } : null,
    pendingRequests: queue.map((request) => ({ ...request })),
  });
  const emit = (updates) => {
    state = { ...state, ...updates, pendingNodeIds: queue.map((request) => request.elementId) };
    onChange?.({ ...state, failures: state.failures.map((failure) => ({ ...failure })) });
    if (!disposed && snapshotEnabled) onSnapshotChange?.(snapshot());
  };
  const drain = () => {
    if (runningLoop || disposed) return runningLoop;
    runningLoop = (async () => {
      while (queue.length && !disposed) {
        if (stopRequested) {
          emit({ status: "stopped", currentNodeId: null });
          return;
        }
        if (pauseRequested) {
          emit({ status: "paused", currentNodeId: null });
          return;
        }
        const request = queue.shift();
        currentRequest = request;
        currentAbortController = new AbortController();
        emit({ status: "running", currentNodeId: request.elementId });
        try {
          await execute(request, { signal: currentAbortController.signal });
          if (disposed) return;
          currentRequest = null;
          currentAbortController = null;
          emit({ completed: state.completed + 1, currentNodeId: null });
          if (stopRequested) {
            emit({ status: "stopped" });
            return;
          }
          if (pauseRequested) {
            emit({ status: "paused" });
            return;
          }
        } catch (error) {
          if (disposed) return;
          const failure = { id: request.elementId, message: errorMessage(error) };
          currentRequest = null;
          currentAbortController = null;
          if (stopRequested) {
            emit({ status: "stopped", currentNodeId: null });
            return;
          }
          pauseRequested = true;
          emit({ status: "failed", currentNodeId: null, failures: [...state.failures, failure] });
          return;
        }
      }
      if (disposed) return;
      emit({ status: state.failures.length ? "completed_with_errors" : "completed", currentNodeId: null });
      onSnapshotChange?.(null);
    })().finally(() => {
      runningLoop = null;
      if (!disposed && state.status === "running" && queue.length) void drain();
    });
    return runningLoop;
  };
  const controller = {
    start(requests) {
      if (["running", "pausing", "stopping"].includes(state.status)) return runningLoop;
      queue = Array.isArray(requests) ? [...requests] : [];
      currentRequest = null;
      currentAbortController = null;
      pauseRequested = false;
      stopRequested = false;
      snapshotEnabled = true;
      state = workflowQueueState({ total: queue.length, status: queue.length ? "running" : "idle" });
      emit({});
      return queue.length ? drain() : Promise.resolve(state);
    },
    pause() {
      if (state.status !== "running") return;
      pauseRequested = true;
      emit({ status: state.currentNodeId ? "pausing" : "paused" });
    },
    resume() {
      if (!["paused", "failed"].includes(state.status) || !queue.length) return;
      pauseRequested = false;
      stopRequested = false;
      emit({ status: "running" });
      if (runningLoop) runningLoop.finally(() => { if (state.status === "running" && queue.length) void drain(); });
      else void drain();
    },
    retryFailures(requests) {
      if (!["paused", "failed", "completed_with_errors"].includes(state.status)) return runningLoop;
      const candidates = Array.isArray(requests) ? requests : [];
      const retryable = [];
      const seen = new Set();
      for (const request of candidates) {
        const id = String(request?.elementId ?? "").trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        retryable.push({ ...request, elementId: id });
      }
      if (!retryable.length) return runningLoop;
      queue = [
        ...retryable,
        ...queue.filter((request) => !seen.has(String(request?.elementId ?? "").trim())),
      ];
      pauseRequested = false;
      stopRequested = false;
      snapshotEnabled = true;
      emit({
        status: "running",
        failures: state.failures.filter((failure) => !seen.has(String(failure?.id ?? "").trim())),
      });
      if (runningLoop) {
        runningLoop.finally(() => { if (state.status === "running" && queue.length) void drain(); });
      } else {
        void drain();
      }
      return runningLoop;
    },
    stop() {
      if (!["running", "pausing", "paused", "failed"].includes(state.status)) return;
      queue = [];
      pauseRequested = false;
      stopRequested = true;
      snapshotEnabled = false;
      emit({ status: state.currentNodeId ? "stopping" : "stopped" });
      onSnapshotChange?.(null);
      currentAbortController?.abort();
    },
    dispose() {
      disposed = true;
      pauseRequested = true;
    },
    getState() {
      return { ...state, failures: state.failures.map((failure) => ({ ...failure })) };
    },
  };
  if (state.status === "running" && queue.length) Promise.resolve().then(() => drain());
  return controller;
}

function restoreWorkflowQueueSnapshot(snapshot) {
  const savedState = snapshot && typeof snapshot === "object" ? snapshot.state : null;
  const pendingRequests = Array.isArray(snapshot?.pendingRequests) ? snapshot.pendingRequests : [];
  const currentRequest = snapshot?.currentRequest && typeof snapshot.currentRequest === "object"
    ? { ...snapshot.currentRequest, __restoredWorkflowCurrent: true }
    : null;
  const requests = [currentRequest, ...pendingRequests]
    .filter((request) => request && String(request.elementId ?? "").trim())
    .map((request) => ({ ...request }));
  if (!savedState || !requests.length && !["paused", "failed"].includes(savedState.status)) {
    return { requests: [], state: workflowQueueState() };
  }
  const failures = Array.isArray(savedState.failures)
    ? savedState.failures.filter((failure) => failure && failure.id).map((failure) => ({ id: String(failure.id), message: String(failure.message ?? "") }))
    : [];
  const completed = Math.max(0, Number(savedState.completed) || 0);
  const total = Math.max(completed + requests.length, Number(savedState.total) || 0);
  const status = savedState.status === "pausing" ? "paused" : savedState.status;
  return {
    requests,
    state: workflowQueueState({
      status: ["running", "paused", "failed"].includes(status) ? status : requests.length ? "paused" : "idle",
      total,
      completed,
      currentNodeId: null,
      pendingNodeIds: requests.map((request) => request.elementId),
      failures,
    }),
  };
}

function workflowQueueState(overrides = {}) {
  return {
    status: "idle",
    total: 0,
    completed: 0,
    currentNodeId: null,
    pendingNodeIds: [],
    failures: [],
    ...overrides,
  };
}

function canvasContainsGenerationArtifact(api, generatorId, artifact) {
  const storageObjectId = String(artifact?.storageObjectId ?? "").trim();
  const artifactUrl = normalizeRecoveryUrl(artifact?.storageUrl ?? artifact?.url);
  return (api.getSceneElements?.() ?? []).some((element) => {
    if (!element || element.isDeleted || element.id === generatorId) return false;
    const data = element.customData ?? {};
    if (storageObjectId && [data.storageObjectId, data.resultStorageObjectId].some((value) => String(value ?? "").trim() === storageObjectId)) return true;
    const existingUrl = normalizeRecoveryUrl(data.storageUrl ?? data.mediaUrl ?? data.resultUrl ?? element.link);
    return Boolean(artifactUrl && existingUrl && artifactUrl === existingUrl);
  });
}

export async function executeCanvasNodeGeneration({ api, request, onGenerate, onStateChange, signal, generationConfig = null }) {
  const id = String(request?.elementId ?? "");
  const type = String(request?.type ?? "");
  const kind = generationKind(type);
  if (!api || !id || typeof onGenerate !== "function") {
    throw new Error("当前画布没有可用的生成服务");
  }
  const executionRequest = {
    ...request,
    __generationUpstreamInput: snapshotGenerationDependencies(api, request),
  };
  const update = (targetApi, targetId, updates) => updateGenerator(targetApi, targetId, type, updates);
  const existingNodeData = api.getSceneElements?.().find((element) => element.id === id)?.customData ?? {};
  const existingTaskId = existingNodeData.status === "running"
    ? String(existingNodeData.taskId ?? "").trim()
    : "";
  const persistedInputSignature = String(existingNodeData.generationInputSignature ?? "").trim();
  if (existingTaskId && persistedInputSignature && persistedInputSignature !== canvasGenerationInputSignature(executionRequest)) {
    markCanvasNodeGenerationResumeStale(api, executionRequest, existingTaskId);
    const staleError = Object.assign(new Error("生成任务提交后输入已更新，旧结果不会自动应用。"), {
      code: "canvas_generation_stale_input",
      taskId: existingTaskId,
    });
    onStateChange?.({ id, kind, running: false, error: staleError.message });
    throw staleError;
  }
  if (!existingTaskId && generationConfig && kind !== "director") {
    const model = resolveCanvasGenerationModel(
      generationConfig.config,
      kind,
      request?.modelCode ?? request?.model,
    )?.raw;
    const credit = resolveCanvasGenerationCreditState(
      model,
      buildCanvasGenerationParameters(kind, request ?? {}),
      generationConfig.creditBalance,
    );
    if (credit.insufficient) {
      const message = canvasGenerationCreditMessage(credit, generationConfig.creditStatus);
      api.setToast?.({ message, closable: true });
      throw Object.assign(new Error(message), {
        code: "canvas_generation_credit_insufficient",
        details: credit,
      });
    }
  }
  const directorIdempotencyKey = kind === "director"
    ? existingNodeData.status === "running" && String(existingNodeData.directorIdempotencyKey ?? "").trim()
      ? String(existingNodeData.directorIdempotencyKey).trim()
      : createDirectorIdempotencyKey()
    : "";
  const generationIdempotencyKey = kind !== "director"
    ? existingNodeData.generationReplayPending === true && String(existingNodeData.generationIdempotencyKey ?? "").trim()
      ? String(existingNodeData.generationIdempotencyKey).trim()
      : createGenerationIdempotencyKey(kind)
    : "";
  update(api, id, {
    status: "running",
    error: "",
    inputUpdated: false,
    pollingDetached: false,
    authRequired: false,
    generationNoticeDismissed: null,
    ...(directorIdempotencyKey ? { directorIdempotencyKey, directorReplayPending: false } : {}),
    ...(generationIdempotencyKey ? { generationIdempotencyKey, generationReplayPending: true } : {}),
  });
  onStateChange?.({ id, kind, running: true, error: "" });
  try {
    const result = await onGenerate(
      directorIdempotencyKey
        ? { ...executionRequest, directorIdempotencyKey }
        : generationIdempotencyKey ? { ...executionRequest, generationIdempotencyKey } : executionRequest,
      { signal },
    );
    const current = api.getSceneElements?.().find((element) => element.id === id && !element.isDeleted);
    if (!canvasGenerationInputsMatch(currentGenerationInput(current, executionRequest, api), executionRequest)) {
      markCanvasNodeGenerationInputStale(
        api,
        executionRequest,
        result?.taskId ?? result?.task?.taskId ?? result?.task?.id,
      );
      throw Object.assign(new Error("生成完成前节点输入已更新，请确认后重新生成。"), {
        code: "canvas_generation_stale_input",
      });
    }
    if (kind === "director") {
      update(api, id, {
        ...canvasDirectorResultPatch(result),
        inputUpdated: false,
      });
      onStateChange?.({ id, kind, running: false, error: "" });
      return result;
    }
    const artifacts = Array.isArray(result?.artifacts) && result.artifacts.length
      ? result.artifacts
      : result?.artifact ? [result.artifact] : [];
    if (kind === "audio" && (!artifacts[0]?.url || !String(artifacts[0]?.mimeType ?? "").startsWith("audio/") || !artifacts[0]?.storageObjectId)) {
      throw new Error("音频任务未返回已归档的标准音频产物");
    }
    const insertionErrors = [];
    for (const artifact of artifacts) {
      if (!artifact?.url) continue;
      if (canvasContainsGenerationArtifact(api, id, artifact)) continue;
      try {
        if (kind === "video") await insertVideoOnCanvas(api, artifact);
        else if (kind === "audio") createUploadedAudioNodeElement(api, {
          title: artifact.title || "生成音频",
          source: "generated",
          sourceKind: "generated",
          mediaUrl: artifact.url,
          mimeType: artifact.mimeType,
          durationSeconds: artifact.durationSeconds,
          storageUrl: artifact.storageUrl || artifact.url,
          storageObjectId: artifact.storageObjectId,
          cloudArchiveStatus: "archived",
          sourceAction: "generated",
        });
        else await insertImageOnCanvas(api, artifact);
      } catch (error) {
        insertionErrors.push(errorMessage(error));
      }
    }
    const artifact = artifacts[0] ?? null;
    update(api, id, {
      status: "completed",
      taskId: result?.taskId ?? result?.task?.taskId ?? result?.task?.id ?? null,
      staleGenerationTaskId: null,
      resultUrl: artifact?.url ?? null,
      resultMimeType: artifact?.mimeType ?? null,
      resultStorageUrl: artifact?.storageUrl ?? artifact?.url ?? null,
      resultStorageObjectId: artifact?.storageObjectId ?? null,
      resultUrls: artifacts.map((item) => item.url).filter(Boolean),
      artifactInsertError: insertionErrors.join("；"),
      error: "",
      inputUpdated: false,
      generationReplayPending: false,
    });
    if (insertionErrors.length) {
      api.setToast?.({ message: "生成已完成，但部分结果未能插入画布，可在生成历史中重试。", closable: true });
    }
    onStateChange?.({ id, kind, running: false, error: "" });
    return result;
  } catch (error) {
    const message = errorMessage(error);
    const code = String(error?.code ?? "");
    if (code === "canvas_generation_stale_input") {
      onStateChange?.({ id, kind, running: false, error: message });
      throw error;
    }
    update(api, id, isUnauthenticatedError(error)
      ? {
          status: existingTaskId ? "running" : "idle",
          error: existingTaskId ? "登录后将继续恢复该生成任务。" : "登录后可重新生成。",
          pollingDetached: Boolean(existingTaskId),
          authRequired: true,
        }
      : kind === "director" && isIndeterminateDirectorError(error)
        ? {
            status: "running",
            error: "导演台运行结果尚未确认，请恢复运行结果。",
            directorIdempotencyKey,
            directorReplayPending: true,
          }
      : kind !== "director" && isIndeterminateGenerationError(error)
        ? {
            status: "failed",
            error: "生成提交结果尚未确认，请重试以恢复同一次请求。",
            generationIdempotencyKey,
            generationReplayPending: true,
          }
      : code === "canvas_generation_canceled"
        ? { status: "canceled", error: message, cancellationConfirmed: true }
        : code === "canvas_generation_detached"
          ? { status: "running", error: message, pollingDetached: true }
          : {
              status: "failed",
              error: message,
              ...(kind === "director" ? { directorReplayPending: false } : { generationReplayPending: false }),
            });
    onStateChange?.({ id, kind, running: false, error: message });
    throw error;
  }
}
