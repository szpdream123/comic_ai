import { collectCanvasWorkflowEdges } from "./canvas-workflow-edges.js";
import { parseCanvasDirectorResult } from "./canvas-director-execution.js";
import { canvasVideoCompositionOutputState } from "./canvas-video-composition.js";

const TERMINAL_STATUSES = new Set([
  "completed",
  "success",
  "succeeded",
  "failed",
  "canceled",
  "cancelled",
  "manual_review_required",
  "result_unknown",
]);
const FAILED_STATUSES = new Set([
  "failed",
  "canceled",
  "cancelled",
  "manual_review_required",
  "result_unknown",
]);

function text(value) {
  return String(value ?? "").trim();
}

function firstText(...values) {
  for (const value of values) {
    const normalized = text(value);
    if (normalized) return normalized;
  }
  return "";
}

function directorResultText(data) {
  const result = data?.directorResult;
  if (typeof result === "string") return text(result);
  if (result && typeof result === "object") {
    return text(result.text ?? result.directorInstructions ?? result.instructions ?? result.summary);
  }
  return text(data?.resultText);
}

function taskStatus(task) {
  return text(task?.status ?? task?.workflowStatus ?? task?.task?.status).toLowerCase();
}

export function resolveGenerationTaskId(task) {
  return text(
    task?.taskId
      ?? task?.id
      ?? task?.task?.id
      ?? task?.platform?.tasks?.[0]?.taskId
      ?? task?.platform?.tasks?.[0]?.id,
  );
}

export function collectUpstreamCanvasInput(elements, files, targetNodeId) {
  const liveElements = (Array.isArray(elements) ? elements : []).filter((element) => !element?.isDeleted);
  const byId = new Map(liveElements.map((element) => [text(element.id), element]));
  const upstreamEdges = collectCanvasWorkflowEdges(liveElements)
    .filter((edge) => edge.targetNodeId === text(targetNodeId));
  const upstreamIds = upstreamEdges.map((edge) => edge.sourceNodeId);
  const prompts = [];
  const referenceImages = [];
  const referenceVideos = [];
  const referenceAudios = [];
  const unavailableCompositionOutputs = [];
  for (const upstreamId of upstreamIds) {
    const element = byId.get(upstreamId);
    if (!element) continue;
    const composition = element.customData?.type === "video-composition-node";
    if (composition) {
      const output = canvasVideoCompositionOutputState(liveElements, upstreamId);
      if (!output.ready) {
        unavailableCompositionOutputs.push({ nodeId: upstreamId, reason: output.reason });
        continue;
      }
    }
    const generatedDirectorText = element.customData?.type === "director-node" ? directorResultText(element.customData) : "";
    const prompt = composition ? "" : text(
      element.customData?.type === "director-node" && element.customData?.inputUpdated !== true && generatedDirectorText
        ? generatedDirectorText
        : element.text
          ?? element.customData?.text
          ?? element.customData?.instructions
          ?? element.customData?.prompt
          ?? element.customData?.title,
    );
    if (prompt) prompts.push(prompt);
    if (element.type === "image" && element.fileId) {
      const source = text(element.customData?.storageUrl ?? files?.[element.fileId]?.dataURL);
      if (source) referenceImages.push({
        nodeId: upstreamId,
        name: text(element.customData?.title) || "参考图",
        url: source,
        ...(text(element.customData?.storageObjectId) ? { storageObjectId: text(element.customData.storageObjectId) } : {}),
      });
    }
    const resultUrl = text(element.customData?.resultUrl ?? element.customData?.previewUrl);
    if (resultUrl && element.customData?.mediaKind !== "video") {
      referenceImages.push({
        nodeId: upstreamId,
        name: text(element.customData?.title) || "参考图",
        url: resultUrl,
        ...(text(element.customData?.resultStorageObjectId) ? { storageObjectId: text(element.customData.resultStorageObjectId) } : {}),
      });
    }
    const mediaKind = text(element.customData?.mediaKind);
    const videoUrl = firstText(
      element.type === "embeddable" ? element.link : "",
      element.customData?.videoUrl,
      mediaKind === "video" ? element.customData?.resultUrl : "",
      mediaKind === "video" ? element.customData?.storageUrl : "",
    );
    if (videoUrl) referenceVideos.push({
      nodeId: upstreamId,
      kind: "video",
      name: text(element.customData?.title) || "参考视频",
      url: videoUrl,
      ...(firstText(element.customData?.resultStorageObjectId, element.customData?.storageObjectId)
        ? { storageObjectId: firstText(element.customData?.resultStorageObjectId, element.customData?.storageObjectId) }
        : {}),
    });
    const audioUrl = firstText(
      element.customData?.mediaUrl,
      element.customData?.audioUrl,
      mediaKind === "audio" ? element.customData?.resultUrl : "",
      mediaKind === "audio" ? element.customData?.storageUrl : "",
    );
    if (audioUrl) referenceAudios.push({
      nodeId: upstreamId,
      kind: "audio",
      name: text(element.customData?.title) || "参考音频",
      url: audioUrl,
      ...(firstText(element.customData?.resultStorageObjectId, element.customData?.storageObjectId)
        ? { storageObjectId: firstText(element.customData?.resultStorageObjectId, element.customData?.storageObjectId) }
        : {}),
    });
  }
  const uniqueByUrl = (items) => items.filter((item, index) => items.findIndex((candidate) => candidate.url === item.url) === index);
  return {
    upstreamNodeIds: Array.from(new Set(upstreamIds)),
    upstreamTextFragments: Array.from(new Set(prompts)),
    referenceImages: uniqueByUrl(referenceImages),
    referenceVideos: uniqueByUrl(referenceVideos),
    referenceAudios: uniqueByUrl(referenceAudios),
    unavailableCompositionOutputs,
  };
}

function parametersFor(kind, data) {
  const configured = data?.parameters && typeof data.parameters === "object"
    ? { ...data.parameters }
    : data?.parameterValues && typeof data.parameterValues === "object"
      ? { ...data.parameterValues }
      : {};
  if (kind === "video") {
    const configuredSize = text(configured.size);
    return {
      ...configured,
      aspectRatio: text(configured.aspectRatio ?? configured.imageAspectRatio ?? configured.ratio ?? (/^(?:auto|\d+(?:\.\d+)?:\d+(?:\.\d+)?)$/i.test(configuredSize) ? configuredSize : undefined) ?? data.aspectRatio) || "16:9",
      durationSec: Number(configured.durationSec ?? configured.videoDurationSec ?? data.duration) || 5,
      resolution: text(configured.resolution ?? configured.videoResolution ?? configured.quality ?? data.resolution) || "720p",
      count: Number(configured.count ?? data.outputCount) || 1,
    };
  }
  if (kind === "audio") {
    return {
      ...configured,
      voice: text(configured.voice ?? configured.voiceId ?? data.voice) || undefined,
      format: text(configured.format ?? data.format) || "mp3",
      rate: Number(configured.rate ?? data.rate ?? 1),
      pitch: Number(configured.pitch ?? data.pitch ?? 1),
      volume: Number(configured.volume ?? data.volume ?? 50),
    };
  }
  const configuredSize = text(configured.size);
  const sizeIsAspectRatio = /^(?:auto|\d+(?:\.\d+)?:\d+(?:\.\d+)?)$/i.test(configuredSize);
  return {
    ...configured,
    aspectRatio: text(configured.aspectRatio ?? configured.imageAspectRatio ?? configured.ratio ?? (sizeIsAspectRatio ? configured.size : undefined) ?? data.aspectRatio) || "1:1",
    quality: text(configured.quality ?? configured.imageResolution ?? configured.resolution ?? (!sizeIsAspectRatio ? configured.size : undefined) ?? data.quality) || "standard",
    count: Number(configured.count ?? data.outputCount) || 1,
  };
}

export function buildCanvasGenerationParameters(kind, data) {
  return parametersFor(kind, data);
}

export function buildCanvasGenerationPayload({ kind, nodeId, data, elements, files, canvasProjectId }) {
  const upstream = collectUpstreamCanvasInput(elements, files, nodeId);
  const directPrompt = text(kind === "director" ? data?.instructions ?? data?.prompt : data?.prompt);
  const prompt = [directPrompt, ...upstream.upstreamTextFragments].filter(Boolean).join("\n\n");
  const directReferenceImages = (Array.isArray(data?.inputImages) ? data.inputImages : [])
    .map((value, index) => ({
      nodeId,
      name: kind === "video" && index < 2 ? (index === 0 ? "首帧" : "尾帧") : `参考图 ${index + 1}`,
      url: text(value?.url ?? value?.dataURL ?? value),
      ...(text(value?.storageObjectId) ? { storageObjectId: text(value.storageObjectId) } : {}),
    }))
    .filter((item) => item.url);
  const referenceImages = [...directReferenceImages, ...upstream.referenceImages]
    .filter((item, index, items) => items.findIndex((candidate) => candidate.url === item.url) === index);
  const directorMediaReferences = [
    ...upstream.referenceImages.map((item) => ({ nodeId: item.nodeId, kind: "image", name: item.name, ...(item.storageObjectId ? { storageObjectId: item.storageObjectId } : {}) })),
    ...upstream.referenceVideos.map(({ nodeId: sourceNodeId, kind, name, storageObjectId }) => ({ nodeId: sourceNodeId, kind, name, ...(storageObjectId ? { storageObjectId } : {}) })),
    ...upstream.referenceAudios.map(({ nodeId: sourceNodeId, kind, name, storageObjectId }) => ({ nodeId: sourceNodeId, kind, name, ...(storageObjectId ? { storageObjectId } : {}) })),
  ].filter((item, index, items) => items.findIndex((candidate) => candidate.nodeId === item.nodeId && candidate.kind === item.kind) === index);
  const directorConnections = collectCanvasWorkflowEdges(elements)
    .filter((edge) => edge.targetNodeId === text(nodeId))
    .map((edge) => ({
      sourceNodeId: edge.sourceNodeId,
      sourcePortId: edge.sourcePortId,
      targetNodeId: edge.targetNodeId,
      targetPortId: edge.targetPortId,
      kind: text(edge.data?.kind),
    }));
  const canvasContext = kind === "director"
    ? {
        upstreamNodeIds: upstream.upstreamNodeIds,
        upstreamTextFragments: upstream.upstreamTextFragments,
        ...(directorConnections.length ? { connections: directorConnections } : {}),
        ...(directorMediaReferences.length ? { mediaReferences: directorMediaReferences } : {}),
      }
    : {
        upstreamNodeIds: upstream.upstreamNodeIds,
        upstreamTextFragments: upstream.upstreamTextFragments,
        referenceImages,
        referenceVideos: upstream.referenceVideos,
        referenceAudios: upstream.referenceAudios,
      };
  const payload = {
    kind,
    mediaKind: kind === "director" ? "text" : kind,
    targetType: "canvas",
    targetId: nodeId,
    prompt,
    model: text(data?.modelCode ?? data?.model) || undefined,
    parameters: kind === "director" ? {} : parametersFor(kind, data ?? {}),
    ...(kind === "director" ? {} : { referenceImages: referenceImages.map((item) => item.url) }),
    canvasContext,
  };
  if (kind === "director") payload.instructions = directPrompt;
  if (kind === "audio") payload.text = prompt;
  if (kind !== "director" && referenceImages.length) {
    payload.parameters.referenceImages = referenceImages;
    payload.parameters.filePaths = referenceImages.map((item) => item.url);
  }
  if (kind === "video") {
    payload.motionPrompt = prompt;
    if (directReferenceImages[0]) {
      payload.firstFrameUrl = directReferenceImages[0].url;
      payload.parameters.firstFrame = directReferenceImages[0];
    }
    if (directReferenceImages[1]) {
      payload.lastFrameUrl = directReferenceImages[1].url;
      payload.parameters.lastFrame = directReferenceImages[1];
    }
    if (upstream.referenceVideos.length) {
      payload.sourceVideo = upstream.referenceVideos[0];
      payload.sourceVideoUrl = upstream.referenceVideos[0].url;
      payload.parameters.referenceVideos = upstream.referenceVideos;
      payload.parameters.videos = upstream.referenceVideos;
      payload.parameters.videoFilePaths = upstream.referenceVideos.map((item) => item.url);
    }
    if (upstream.referenceAudios.length) {
      payload.referenceAudio = upstream.referenceAudios[0];
      payload.referenceAudioUrl = upstream.referenceAudios[0].url;
      payload.parameters.referenceAudio = upstream.referenceAudios[0];
      payload.parameters.referenceAudios = upstream.referenceAudios;
      payload.parameters.audios = upstream.referenceAudios;
      payload.parameters.audioFilePaths = upstream.referenceAudios.map((item) => item.url);
    }
  }
  if (canvasProjectId) {
    payload.target = { kind: "canvas", canvasProjectId, nodeId };
  }
  return payload;
}

function collectUrlCandidates(value, output, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => collectUrlCandidates(item, output, seen));
    return;
  }
  for (const [key, candidate] of Object.entries(value)) {
    if (/^(?:url|src|previewUrl|sourceUrl|resultUrl|outputUrl|imageUrl|videoUrl|audioUrl)$/i.test(key)) {
      const url = text(candidate);
      if (/^(?:https?:|data:|blob:|\/)/i.test(url)) output.push({ url, source: value });
    }
    collectUrlCandidates(candidate, output, seen);
  }
}

function collectDirectUrlCandidates(value, output) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const [key, candidate] of Object.entries(value)) {
    if (!/^(?:url|src|previewUrl|sourceUrl|resultUrl|outputUrl|imageUrl|videoUrl|audioUrl)$/i.test(key)) continue;
    const url = text(candidate);
    if (/^(?:https?:|data:|blob:|\/)/i.test(url)) output.push({ url, source: value });
  }
}

export function extractGenerationArtifacts(task, kind) {
  const candidates = [];
  // The production task API exposes the primary artifact directly on `result`
  // while provider-specific responses may use the nested collections below.
  collectDirectUrlCandidates(task?.result, candidates);
  const preferredRoots = [
    task?.result?.artifacts,
    task?.artifacts,
    task?.result?.outputs,
    task?.outputs,
    task?.result?.fixedImages,
    task?.fixedImages,
    task?.result?.fixedVideos,
    task?.fixedVideos,
    task?.result?.media,
    task?.media,
    task?.result?.artifact,
    task?.artifact,
    task?.output?.artifacts,
    task?.output?.outputs,
    task?.output,
    task?.result?.data,
  ];
  preferredRoots.forEach((root) => collectUrlCandidates(root, candidates));
  const matches = candidates.filter(({ source }) => {
    const mimeType = text(source?.mimeType ?? source?.contentType).toLowerCase();
    const artifactKind = text(source?.artifactKind ?? source?.mediaType ?? source?.mediaKind ?? source?.kind).toLowerCase();
    if (kind === "video") return mimeType.startsWith("video/") || artifactKind === "video";
    if (kind === "audio") return mimeType.startsWith("audio/") || artifactKind === "audio";
    return !mimeType.startsWith("video/") && !mimeType.startsWith("audio/") && !["video", "audio"].includes(artifactKind);
  });
  const untyped = candidates.filter(({ source }) => !text(
    source?.mimeType
      ?? source?.contentType
      ?? source?.artifactKind
      ?? source?.mediaType
      ?? source?.mediaKind
      ?? source?.kind,
  ));
  const selected = matches.length ? matches : untyped;
  return selected.map((match) => ({
    url: match.url,
    mimeType: text(match.source?.mimeType ?? match.source?.contentType) || (kind === "video" ? "video/mp4" : kind === "audio" ? "audio/mpeg" : "image/png"),
    title: text(match.source?.title ?? match.source?.fileName) || (kind === "video" ? "生成视频" : kind === "audio" ? "生成音频" : "生成图片"),
    width: Number(match.source?.width) || undefined,
    height: Number(match.source?.height) || undefined,
    durationSeconds: Number(match.source?.durationSeconds ?? match.source?.durationSec) || undefined,
    storageUrl: text(match.source?.storageUrl ?? match.source?.sourceUrl) || match.url,
    storageObjectId: text(match.source?.storageObjectId ?? match.source?.fileId) || undefined,
  })).filter((artifact, index, artifacts) => artifacts.findIndex((candidate) => candidate.url === artifact.url) === index);
}

export function extractGenerationArtifact(task, kind) {
  return extractGenerationArtifacts(task, kind)[0] ?? null;
}

function delay(milliseconds, signal) {
  return new Promise((resolve) => {
    const timer = globalThis.setTimeout(finish, milliseconds);
    function finish() {
      globalThis.clearTimeout(timer);
      signal?.removeEventListener?.("abort", finish);
      resolve();
    }
    signal?.addEventListener?.("abort", finish, { once: true });
  });
}

export async function cancelCanvasGeneration({ api, taskId }) {
  const normalizedTaskId = text(taskId);
  if (!normalizedTaskId || typeof api?.cancelGenerationTask !== "function") {
    return { canceled: false, taskId: normalizedTaskId, reason: "provider_cancel_not_supported" };
  }
  try {
    const result = await api.cancelGenerationTask(normalizedTaskId);
    return {
      canceled: ["canceled", "already_canceled"].includes(text(result?.status)),
      taskId: normalizedTaskId,
      reason: text(result?.reason),
      result,
    };
  } catch (error) {
    return {
      canceled: false,
      taskId: normalizedTaskId,
      reason: text(error?.details?.reason) || text(error?.errorCode) || "provider_cancel_failed",
      error,
    };
  }
}

function canceledGenerationError(taskId) {
  return Object.assign(new Error("生成任务已取消，未消耗的预留积分已释放。"), {
    code: "canvas_generation_canceled",
    taskId,
  });
}

function detachedGenerationError(taskId, reason) {
  return Object.assign(new Error("已停止本地等待；远端任务仍可能继续运行并产生费用，可稍后刷新画布恢复结果。"), {
    code: "canvas_generation_detached",
    taskId,
    reason,
    continuesRemotely: true,
  });
}

async function stopRequestedGeneration({ api, signal, taskId }) {
  if (!signal?.aborted) return;
  const cancellation = await cancelCanvasGeneration({ api, taskId });
  if (cancellation.canceled) throw canceledGenerationError(cancellation.taskId);
  throw detachedGenerationError(cancellation.taskId, cancellation.reason);
}

async function waitForCanvasGeneration({ api, kind, task, taskId, onProgress, pollIntervalMs, maxPolls, signal }) {
  let currentTask = task;
  let currentTaskId = resolveGenerationTaskId(currentTask) || text(taskId);
  await onProgress?.({ task: currentTask, taskId: currentTaskId, status: taskStatus(currentTask) || "queued" });
  await stopRequestedGeneration({ api, signal, taskId: currentTaskId });
  for (let attempt = 0; currentTaskId && attempt < maxPolls && !TERMINAL_STATUSES.has(taskStatus(currentTask)); attempt += 1) {
    await delay(pollIntervalMs, signal);
    await stopRequestedGeneration({ api, signal, taskId: currentTaskId });
    currentTask = await api.getGenerationTask(currentTaskId);
    currentTaskId = resolveGenerationTaskId(currentTask) || currentTaskId;
    await onProgress?.({ task: currentTask, taskId: currentTaskId, status: taskStatus(currentTask) || "running" });
  }
  const status = taskStatus(currentTask);
  if (["canceled", "cancelled"].includes(status)) throw canceledGenerationError(currentTaskId);
  if (FAILED_STATUSES.has(status)) {
    throw new Error(firstText(
      currentTask?.failure?.displayMessage,
      currentTask?.failure?.message,
      currentTask?.failure?.providerMessage,
      currentTask?.error?.message,
      currentTask?.errorMessage,
      currentTask?.message,
      currentTask?.failure?.code,
      currentTask?.failureCode,
    ) || "生成任务失败");
  }
  if (currentTaskId && !TERMINAL_STATUSES.has(status)) throw new Error("生成任务等待超时，请稍后在历史记录中查看");
  const artifacts = extractGenerationArtifacts(currentTask, kind);
  return { task: currentTask, taskId: currentTaskId, artifact: artifacts[0] ?? null, artifacts };
}

function directorRunFailedError(run) {
  return Object.assign(new Error(firstText(
    run?.failure?.displayMessage,
    run?.failure?.message,
    run?.error?.message,
    run?.error,
  ) || "导演指令生成失败。"), {
    code: "canvas_director_run_failed",
    runId: text(run?.runId ?? run?.id),
  });
}

async function waitForCanvasDirectorRun({ api, canvasProjectId, nodeId, initialRun, pollIntervalMs, maxPolls, signal }) {
  let current = initialRun;
  const runId = text(initialRun?.runId ?? initialRun?.id);
  for (let attempt = 0; attempt <= maxPolls; attempt += 1) {
    const status = taskStatus(current);
    if (["failed", "canceled", "cancelled"].includes(status)) throw directorRunFailedError(current);
    if (parseCanvasDirectorResult(current)) return current;
    if (!["created", "queued", "running", "processing", "pending"].includes(status) && status) {
      throw directorRunFailedError(current);
    }
    if (attempt === maxPolls || typeof api.listCanvasNodeRuns !== "function") break;
    if (signal?.aborted) throw detachedGenerationError(runId, "director_run_in_progress");
    await delay(pollIntervalMs, signal);
    if (signal?.aborted) throw detachedGenerationError(runId, "director_run_in_progress");
    const history = await api.listCanvasNodeRuns(canvasProjectId, nodeId);
    const runs = Array.isArray(history?.runs) ? history.runs : [];
    current = runs.find((run) => text(run?.id ?? run?.runId) === runId) ?? runs[0] ?? current;
  }
  throw Object.assign(new Error("导演台仍在运行，请稍后恢复运行结果。"), {
    code: "canvas_director_run_pending",
    runId,
  });
}

export async function runCanvasGeneration({ api, kind, nodeId, data, elements, files, canvasProjectId, onProgress, pollIntervalMs = 1500, maxPolls = 120, signal }) {
  if (!api) throw new Error("生成服务不可用");
  const payload = buildCanvasGenerationPayload({ kind, nodeId, data, elements, files, canvasProjectId });
  if (!payload.prompt) {
    throw Object.assign(new Error("请填写提示词或连接一个文本节点"), {
      code: "canvas_generation_invalid_input",
    });
  }
  const idempotencyKey = text(data?.generationIdempotencyKey) || undefined;
  let task;
  if (kind === "director" && canvasProjectId && api.runCanvasNode) {
    const directorRun = await api.runCanvasNode(canvasProjectId, nodeId, payload, {
      signal,
      idempotencyKey: text(data?.directorIdempotencyKey) || undefined,
    });
    return waitForCanvasDirectorRun({
      api,
      canvasProjectId,
      nodeId,
      initialRun: directorRun,
      pollIntervalMs,
      maxPolls,
      signal,
    });
  } else if (kind === "image" && canvasProjectId && api.createImageGenerationTask) {
    task = await api.createImageGenerationTask(payload, { idempotencyKey, signal });
  } else if (["video", "audio"].includes(kind) && canvasProjectId && api.runCanvasNode) {
    task = await api.runCanvasNode(canvasProjectId, nodeId, payload, { idempotencyKey, signal });
  } else if (api.createStandaloneCanvasGenerationTask) {
    task = await api.createStandaloneCanvasGenerationTask(payload, { idempotencyKey, signal });
  } else {
    throw new Error("当前画布没有可用的生成接口");
  }

  return waitForCanvasGeneration({ api, kind, task, onProgress, pollIntervalMs, maxPolls, signal });
}

export async function resumeCanvasGeneration({ api, kind, taskId, onProgress, pollIntervalMs = 1500, maxPolls = 120, signal }) {
  const normalizedTaskId = text(taskId);
  if (!api || typeof api.getGenerationTask !== "function") throw new Error("生成服务不可用");
  if (!normalizedTaskId) throw new Error("生成任务标识不存在");
  const task = await api.getGenerationTask(normalizedTaskId);
  return waitForCanvasGeneration({ api, kind, task, taskId: normalizedTaskId, onProgress, pollIntervalMs, maxPolls, signal });
}
