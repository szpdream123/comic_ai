function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function firstText(...values) {
  for (const value of values) {
    const normalized = text(value);
    if (normalized) return normalized;
  }
  return "";
}

function resultSources(value) {
  const source = record(value) ?? {};
  const result = record(source.result) ?? {};
  const output = record(source.output) ?? {};
  const outputSnapshot = record(source.outputSnapshot) ?? {};
  const artifact = record(source.artifact) ?? {};
  const artifactMetadata = record(artifact.metadata ?? artifact.metadataJson) ?? {};
  return { source, result, output, outputSnapshot, artifact, artifactMetadata };
}

export function parseCanvasDirectorResult(value) {
  const { source, result, output, outputSnapshot, artifact, artifactMetadata } = resultSources(value);
  const directorText = firstText(
    result.text,
    result.directorInstructions,
    result.instructions,
    result.content,
    output.text,
    output.directorInstructions,
    output.instructions,
    output.content,
    outputSnapshot.text,
    outputSnapshot.directorInstructions,
    outputSnapshot.instructions,
    outputSnapshot.content,
    artifactMetadata.text,
    artifactMetadata.directorInstructions,
    artifactMetadata.instructions,
    artifactMetadata.content,
    artifact.text,
    source.text,
    source.resultText,
    source.directorInstructions,
    source.directorResult,
    source.directorResult?.text,
    source.directorResult?.directorInstructions,
    source.instructions,
    source.content,
  );
  if (!directorText) return null;
  const structured = record(
    result.structured
      ?? result.structuredResult
      ?? output.structured
      ?? output.structuredResult
      ?? outputSnapshot.structured
      ?? outputSnapshot.structuredResult
      ?? artifactMetadata.structured
      ?? artifactMetadata.structuredResult
      ?? source.directorResult
      ?? source.structured,
  );
  return {
    text: directorText,
    structured,
    runId: firstText(source.runId, source.id, source.run?.id),
    runNo: Number(source.runNo ?? source.run?.runNo) || undefined,
    status: firstText(source.status, source.run?.status) || "succeeded",
    ...(record(source.inputSnapshot) ? { inputSnapshot: record(source.inputSnapshot) } : {}),
  };
}

function normalizedDirectorRecoveryInput(value) {
  const source = record(value);
  if (Number(source?.version) !== 1) return null;
  const strings = (values) => Array.from(new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean)));
  const connections = (Array.isArray(source.connections) ? source.connections : []).map((value) => {
    const item = record(value) ?? {};
    return {
      sourceNodeId: text(item.sourceNodeId),
      sourcePortId: text(item.sourcePortId),
      targetNodeId: text(item.targetNodeId),
      targetPortId: text(item.targetPortId),
      kind: text(item.kind),
    };
  }).filter((item) => item.sourceNodeId && item.sourcePortId && item.targetNodeId && item.targetPortId)
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const mediaReferences = (Array.isArray(source.mediaReferences) ? source.mediaReferences : []).map((value) => {
    const item = record(value) ?? {};
    return {
      nodeId: text(item.nodeId),
      kind: text(item.kind),
      name: text(item.name),
      storageObjectId: text(item.storageObjectId),
    };
  }).filter((item) => item.nodeId && item.kind)
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  if (mediaReferences.some((item) => !item.storageObjectId)) return null;
  return {
    version: 1,
    instructions: text(source.instructions),
    prompt: text(source.prompt),
    model: text(source.model),
    upstreamNodeIds: strings(source.upstreamNodeIds).sort(),
    upstreamTextFragments: strings(source.upstreamTextFragments),
    connections,
    mediaReferences,
  };
}

export function canvasDirectorRecoveryInputFromPayload(payload) {
  const source = record(payload) ?? {};
  const context = record(source.canvasContext) ?? {};
  return normalizedDirectorRecoveryInput({
    version: 1,
    instructions: source.instructions,
    prompt: source.prompt,
    model: source.model,
    upstreamNodeIds: context.upstreamNodeIds,
    upstreamTextFragments: context.upstreamTextFragments,
    connections: context.connections,
    mediaReferences: context.mediaReferences,
  });
}

export function canvasDirectorRecoveryInputsMatch(actual, expected) {
  const left = normalizedDirectorRecoveryInput(actual);
  const right = normalizedDirectorRecoveryInput(expected);
  return Boolean(left && right && JSON.stringify(left) === JSON.stringify(right));
}

export function findLatestCanvasDirectorResult(history, expectedRecoveryInput) {
  const runs = (Array.isArray(history?.runs) ? history.runs : [])
    .map((run, index) => ({ run, index, runNo: Number(run?.runNo) || 0 }))
    .sort((left, right) => right.runNo - left.runNo || left.index - right.index);
  for (const { run } of runs) {
    const status = text(run?.status).toLowerCase();
    if (status && !["completed", "success", "succeeded"].includes(status)) continue;
    const parsed = parseCanvasDirectorResult(run);
    if (!parsed) return null;
    if (expectedRecoveryInput && !canvasDirectorRecoveryInputsMatch(parsed.inputSnapshot?.recoveryInput, expectedRecoveryInput)) return null;
    return parsed;
  }
  if (expectedRecoveryInput) return null;
  return parseCanvasDirectorResult(history);
}

export function collectCanvasDirectorRecoveryCandidates(elements) {
  return (Array.isArray(elements) ? elements : []).filter((element) => {
    const data = element?.customData;
    if (!element?.id || element?.isDeleted || data?.type !== "director-node") return false;
    if (data.inputUpdated === true) return false;
    if (parseCanvasDirectorResult(data)) return false;
    return data.status === "running"
      || data.status === "completed"
      || data.directorReplayPending === true;
  });
}

export function canvasDirectorResultPatch(result) {
  const parsed = parseCanvasDirectorResult(result);
  if (!parsed) {
    throw Object.assign(new Error("导演台未返回可用的导演指令。"), {
      code: "canvas_director_result_invalid",
    });
  }
  return {
    status: "completed",
    executionAvailability: "ready",
    directorResult: parsed.text,
    directorStructuredResult: parsed.structured ?? undefined,
    directorRunId: parsed.runId || undefined,
    directorRunNo: parsed.runNo,
    inputUpdated: false,
    directorReplayPending: false,
    error: undefined,
  };
}
