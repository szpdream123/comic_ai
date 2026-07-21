import { collectCanvasWorkflowEdges } from "./canvas-workflow-edges.js";

function hasGenerationBaseline(element) {
  const data = element?.customData ?? {};
  return Boolean(data.taskId || data.resultUrl || data.status === "completed");
}

function isGenerator(element) {
  const data = element?.customData ?? {};
  return ["image-generator", "video-generator", "director-node"].includes(data.type)
    || data.type === "audio-node" && !["upload", "generated"].includes(data.sourceKind);
}

function dependencyValue(element) {
  const data = element?.customData ?? {};
  const fallbackText = element?.text ?? data.text ?? data.instructions ?? data.notes ?? data.prompt ?? data.title ?? "";
  const director = data.type === "director-node";
  const directorResult = data.directorResult;
  const directorResultText = typeof directorResult === "string"
    ? directorResult
    : directorResult && typeof directorResult === "object"
      ? directorResult.text ?? directorResult.directorInstructions ?? directorResult.instructions ?? directorResult.summary ?? ""
      : data.resultText ?? "";
  return {
    id: element?.id ?? "",
    type: element?.type ?? "",
    text: director && data.inputUpdated !== true && directorResultText ? directorResultText : fallbackText,
    fileId: element?.fileId ?? "",
    link: element?.link ?? "",
    prompt: data.prompt ?? "",
    mediaUrl: data.mediaUrl ?? "",
    resultUrl: data.resultUrl ?? "",
    storageUrl: data.storageUrl ?? "",
    selectedArtifactId: data.selectedArtifactId ?? "",
    ...(director ? {
      directorResult: directorResult ?? "",
      directorStructuredResult: data.directorStructuredResult ?? "",
      directorInputUpdated: data.inputUpdated === true,
      directorFallbackText: data.inputUpdated === true ? fallbackText : "",
    } : {}),
  };
}

export function collectCanvasGenerationDependencyFingerprints(elements = []) {
  const live = elements.filter((element) => element && !element.isDeleted);
  const byId = new Map(live.map((element) => [element.id, element]));
  const incoming = new Map();
  for (const edge of collectCanvasWorkflowEdges(live)) {
    const values = incoming.get(edge.targetNodeId) ?? [];
    values.push({
      sourcePortId: edge.sourcePortId,
      targetPortId: edge.targetPortId,
      kind: edge.data?.kind ?? "",
      source: dependencyValue(byId.get(edge.sourceNodeId)),
    });
    incoming.set(edge.targetNodeId, values);
  }
  const fingerprints = {};
  for (const element of live) {
    if (!isGenerator(element)) continue;
    const dependencies = incoming.get(element.id) ?? [];
    dependencies.sort((left, right) => left.source.id.localeCompare(right.source.id) || left.kind.localeCompare(right.kind));
    fingerprints[element.id] = JSON.stringify(dependencies);
  }
  return fingerprints;
}

export function markChangedCanvasGenerationDependencies(elements = [], previousFingerprints = null) {
  const fingerprints = collectCanvasGenerationDependencyFingerprints(elements);
  if (!previousFingerprints) return { elements, fingerprints, changedIds: [] };
  const changedIds = Object.keys(fingerprints).filter((id) => (
    Object.prototype.hasOwnProperty.call(previousFingerprints, id)
    && previousFingerprints[id] !== fingerprints[id]
  ));
  if (!changedIds.length) return { elements, fingerprints, changedIds };
  const changed = new Set(changedIds);
  const now = Date.now();
  return {
    fingerprints,
    changedIds,
    elements: elements.map((element) => {
      if (!changed.has(element?.id) || !hasGenerationBaseline(element) || element.customData?.inputUpdated === true) return element;
      return {
        ...element,
        customData: { ...element.customData, inputUpdated: true },
        version: (element.version ?? 1) + 1,
        versionNonce: Math.floor(Math.random() * 2_000_000_000),
        updated: now,
      };
    }),
  };
}
