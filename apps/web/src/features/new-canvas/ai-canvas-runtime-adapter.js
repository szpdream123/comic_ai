/**
 * Host bridge for the standalone AI Canvas runtime.
 *
 * The runtime is intentionally injected. This module owns the contract between
 * the product shell and the upstream AI Canvas implementation.
 */

import { creatorApi as defaultCreatorApi } from "../../shared/creator-api.js";

export const AI_CANVAS_RUNTIME_ADAPTER_VERSION = "1.0.0";
export const AI_CANVAS_RUNTIME_KIND = "ai-canvas";
export const AI_CANVAS_DOCUMENT_VERSION = 1;

const AI_CANVAS_RUNTIME_NODE_TYPES = new Set([
  "ai-text",
  "ai-image",
  "ai-video",
  "ai-audio",
  "ai-animation",
  "ai-panorama",
  "ai-markdown",
  "ai-storyboard",
  "ai-shotlist",
  "ai-director",
  "source-text",
  "source-image",
  "source-video",
  "source-audio",
  "comment",
  "group",
  "canvas-note",
  "plugin-node",
]);

function normalizeId(value) {
  const id = String(value ?? "").trim();
  return id || null;
}

function sanitizeRuntimeCatalogValue(value) {
  if (Array.isArray(value)) return value.map(sanitizeRuntimeCatalogValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/(?:api[_-]?key|token|secret|password|credential)/iu.test(key))
    .map(([key, nested]) => [key, sanitizeRuntimeCatalogValue(nested)]));
}

export function normalizeAiCanvasRuntimeModel(model = {}, category = "text") {
  const modelCode = String(model.modelCode ?? model.model_code ?? model.modelId ?? model.model_id ?? model.code ?? model.id ?? "").trim();
  if (!modelCode) return null;
  const capabilities = model.capabilities && typeof model.capabilities === "object"
    ? { ...model.capabilities }
    : {};
  const mediaType = String(model.mediaType ?? model.media_type ?? model.mediaKind ?? category).trim().toLowerCase();
  const schema = model.parameterSchema && typeof model.parameterSchema === "object" && !Array.isArray(model.parameterSchema)
    ? model.parameterSchema
    : {};
  const enumValues = (field) => Array.isArray(schema?.[field]?.options)
    ? schema[field].options.map((value) => String(value).trim()).filter(Boolean)
    : [];
  const resolutions = (model.supportedResolutions?.length ? model.supportedResolutions : model.supportedQuality)?.map((value) => String(value).trim()).filter(Boolean)
    ?? enumValues("resolution");
  const ratios = model.supportedRatios?.length ? model.supportedRatios : enumValues("aspectRatio");
  const durations = model.supportedDurations?.map(Number).filter(Number.isFinite) ?? enumValues("durationSec").map(Number).filter(Number.isFinite);
  const defaults = model.defaultParams && typeof model.defaultParams === "object" && !Array.isArray(model.defaultParams) ? model.defaultParams : {};
  const videoCapability = mediaType === "video" && (resolutions.length || ratios.length || durations.length)
    ? {
      resolutions,
      ratios,
      durations,
      ...(defaults.resolution != null || defaults.quality != null ? { defaultResolution: String(defaults.resolution ?? defaults.quality) } : {}),
      ...(defaults.aspectRatio != null || defaults.ratio != null ? { defaultRatio: String(defaults.aspectRatio ?? defaults.ratio) } : {}),
      ...(defaults.durationSec != null ? { defaultDuration: Number(defaults.durationSec) } : {}),
    }
    : undefined;
  return {
    modelCode,
    modelLabel: String(model.modelLabel ?? model.modelName ?? model.model_name ?? model.name ?? model.label ?? modelCode).trim() || modelCode,
    category: ["image", "video", "audio", "text"].includes(mediaType) ? mediaType : category,
    capabilities: sanitizeRuntimeCatalogValue(capabilities),
    supportedRatios: Array.isArray(model.supportedRatios) ? model.supportedRatios.map((value) => String(value).trim()).filter(Boolean) : undefined,
    supportedQuality: Array.isArray(model.supportedQuality) ? model.supportedQuality.map((value) => String(value).trim()).filter(Boolean) : undefined,
    supportedResolutions: Array.isArray(model.supportedResolutions) ? model.supportedResolutions.map((value) => String(value).trim()).filter(Boolean) : undefined,
    supportedDurations: Array.isArray(model.supportedDurations) ? model.supportedDurations.map((value) => String(value).trim()).filter(Boolean) : undefined,
    parameterSchema: model.parameterSchema && typeof model.parameterSchema === "object" && !Array.isArray(model.parameterSchema)
      ? sanitizeRuntimeCatalogValue(model.parameterSchema)
      : undefined,
    defaultParams: model.defaultParams && typeof model.defaultParams === "object" && !Array.isArray(model.defaultParams)
      ? sanitizeRuntimeCatalogValue(model.defaultParams)
      : undefined,
    videoCapability,
    pricing: model.pricing && typeof model.pricing === "object" ? sanitizeRuntimeCatalogValue(model.pricing) : undefined,
    inputModalities: Array.isArray(model.inputModalities)
      ? model.inputModalities.map((value) => String(value).trim()).filter(Boolean)
      : undefined,
  };
}

export function normalizeAiCanvasRuntimeSkill(skill = {}) {
  const id = String(skill.id ?? skill.skillId ?? "").trim();
  if (!id) return null;
  return {
    id,
    name: String(skill.name ?? skill.title ?? "未命名 Skill").trim() || "未命名 Skill",
    description: String(skill.description ?? skill.summary ?? "").trim(),
    summary: String(skill.summary ?? skill.description ?? "").trim(),
    category: String(skill.category ?? "general").trim() || "general",
    source: String(skill.source ?? (skill.ownerUserId ? "mine" : "official")).trim() || "official",
    version: String(skill.version ?? "").trim() || undefined,
    // The runtime picker expects content, while the server remains the source
    // of truth for execution. Keep only an optional, already-sanitized body.
    content: typeof skill.content === "string" ? skill.content : "",
  };
}

async function resolveRuntimeCatalogs(creatorApi, canvasProjectId, context, dependencies) {
  const modelCatalog = context.modelCatalog ?? context.models ?? dependencies.modelCatalog;
  const skillCatalog = context.skillCatalog ?? context.skills ?? dependencies.skillCatalog;
  const modelsPromise = modelCatalog !== undefined
    ? Promise.resolve(modelCatalog)
    : typeof creatorApi?.listCanvasAgentModels === "function" && canvasProjectId
      ? creatorApi.listCanvasAgentModels(canvasProjectId)
      : Promise.resolve([]);
  const generationPromise = modelCatalog !== undefined || typeof creatorApi?.listGlobalGenerationConfig !== "function"
    ? Promise.resolve([])
    : Promise.all(["image", "video", "audio"].map(async (mediaType) => ({
      mediaType,
      payload: await creatorApi.listGlobalGenerationConfig({ mediaType, fresh: true }).catch(() => null),
    })));
  const skillsPromise = skillCatalog !== undefined
    ? Promise.resolve(skillCatalog)
    : typeof creatorApi?.getSkills === "function"
      ? creatorApi.getSkills({ page: 1, pageSize: 50 })
      : Promise.resolve([]);
  const [modelsPayload, generationPayload, skillsPayload] = await Promise.allSettled([modelsPromise, generationPromise, skillsPromise]);
  const modelRows = modelsPayload.status === "fulfilled"
    ? Array.isArray(modelsPayload.value?.models) ? modelsPayload.value.models : Array.isArray(modelsPayload.value) ? modelsPayload.value : []
    : [];
  const skillRows = skillsPayload.status === "fulfilled"
    ? Array.isArray(skillsPayload.value?.items) ? skillsPayload.value.items : Array.isArray(skillsPayload.value?.skills) ? skillsPayload.value.skills : Array.isArray(skillsPayload.value) ? skillsPayload.value : []
    : [];
  const generationRows = generationPayload.status === "fulfilled"
    ? generationPayload.value.flatMap(({ mediaType, payload }) => (
      Array.isArray(payload?.models) ? payload.models.map((model) => ({ ...model, mediaType: model?.mediaType ?? mediaType })) : []
    ))
    : [];
  return {
    models: [...modelRows, ...generationRows].map((model) => normalizeAiCanvasRuntimeModel(model, model.mediaType ?? model.media_type ?? model.mediaKind ?? "text")).filter(Boolean),
    skills: skillRows.map(normalizeAiCanvasRuntimeSkill).filter(Boolean),
  };
}

function normalizeRuntimeNodeType(node) {
  const type = String(node?.type ?? node?.data?.type ?? "").trim();
  if (AI_CANVAS_RUNTIME_NODE_TYPES.has(type)) return type;
  const mediaKind = String(node?.data?.mediaKind ?? "").trim();
  if (type === "script") return "source-text";
  if (type === "send") {
    if (mediaKind === "video") return "ai-video";
    if (mediaKind === "audio") return "ai-audio";
    if (mediaKind === "text") return "ai-text";
    return "ai-image";
  }
  if (type === "image") return "source-image";
  if (type === "video") return "source-video";
  if (type === "audio") return "source-audio";
  if (type === "markdown") return "ai-markdown";
  if (type === "director") return "ai-director";
  return type || "ai-text";
}

function normalizeRuntimeNodeData(node, nextType) {
  const data = { ...(node?.data ?? {}) };
  const previousType = String(node?.type ?? data.type ?? "").trim();
  const label = String(data.label ?? data.title ?? data.fileName ?? "").trim();
  const next = {
    ...data,
    type: nextType,
    ...(label ? { label } : {}),
  };
  delete next.ports;
  if (node?.size?.width != null && next.nodeWidth == null) next.nodeWidth = Number(node.size.width) || node.size.width;
  if (node?.size?.height != null && next.nodeHeight == null) next.nodeHeight = Number(node.size.height) || node.size.height;
  if (previousType === "script") {
    next.role = next.role ?? "source";
    next.output = String(data.output ?? data.text ?? data.prompt ?? "");
    next.status = data.status ?? "success";
  }
  if (previousType === "send") {
    next.prompt = String(data.prompt ?? data.text ?? "");
    if (data.model == null && data.modelCode != null) next.model = data.modelCode;
    next.status = data.status === "running" ? "idle" : data.status ?? "idle";
  }
  if (["image", "video", "audio"].includes(previousType)) {
    next.role = next.role ?? "source";
    next.status = data.status === "empty" ? "idle" : data.status ?? "idle";
    if (previousType === "image") {
      const imageUrl = data.imageUrl ?? data.url ?? data.previewUrl ?? data.thumbnailUrl;
      if (imageUrl != null) next.imageUrl = imageUrl;
    }
    if (previousType === "video") {
      const videoUrl = data.videoUrl ?? data.url ?? data.previewUrl;
      if (videoUrl != null) next.videoUrl = videoUrl;
    }
    if (previousType === "audio") {
      const audioUrl = data.audioUrl ?? data.url ?? data.previewUrl;
      if (audioUrl != null) next.audioUrl = audioUrl;
    }
  }
  return next;
}

export function normalizeAiCanvasRuntimeGrouping(nodes = [], groups = []) {
  const normalizedNodes = (Array.isArray(nodes) ? nodes : []).map((node) => ({
    ...node,
    data: { ...(node?.data ?? {}) },
  }));
  const nodeById = new Map(normalizedNodes.map((node) => [String(node?.id ?? ""), node]));
  const groupNodes = normalizedNodes.filter((node) => node?.type === "group");
  const groupIds = new Set(groupNodes.map((node) => String(node?.id ?? "")).filter(Boolean));
  const sourceGroups = Array.isArray(groups) ? groups : [];
  const groupById = new Map();
  for (const group of sourceGroups) {
    const id = String(group?.id ?? "").trim();
    if (!id || !groupIds.has(id)) continue;
    groupById.set(id, {
      ...group,
      id,
      nodeIds: Array.isArray(group.nodeIds) ? group.nodeIds.map(String) : [],
    });
  }

  const legacyChildIds = new Map();
  for (const groupNode of groupNodes) {
    const groupId = String(groupNode.id);
    const runtimeGroup = groupById.get(groupId) ?? { id: groupId };
    const childIds = [
      ...(Array.isArray(groupNode.data?.childNodeIds) ? groupNode.data.childNodeIds : []),
      ...(Array.isArray(runtimeGroup.nodeIds) ? runtimeGroup.nodeIds : []),
    ].map(String).filter((id) => id && id !== groupId && nodeById.has(id));
    const nodeIds = [...new Set(childIds)];
    const label = String(groupNode.data?.label ?? groupNode.data?.title ?? runtimeGroup.name ?? "分组").trim() || "分组";
    const color = groupNode.data?.color ?? runtimeGroup.color;
    groupById.set(groupId, {
      ...runtimeGroup,
      id: groupId,
      name: String(runtimeGroup.name ?? label),
      nodeIds,
      ...(color ? { color } : {}),
    });
    for (const childId of nodeIds) {
      if (!legacyChildIds.has(childId)) legacyChildIds.set(childId, groupId);
    }
    groupNode.data = {
      ...groupNode.data,
      label,
      groupId,
      ...(color ? { color } : {}),
      childNodeIds: nodeIds,
    };
    const width = Number(groupNode.data?.nodeWidth ?? groupNode.size?.width ?? groupNode.style?.width);
    const height = Number(groupNode.data?.nodeHeight ?? groupNode.size?.height ?? groupNode.style?.height);
    if (Number.isFinite(width) && Number.isFinite(height)) {
      groupNode.style = { ...(groupNode.style ?? {}), width, height };
      groupNode.width = groupNode.width ?? width;
      groupNode.height = groupNode.height ?? height;
    }
  }

  const normalizedGroups = [...groupById.values()].map((group) => ({
    ...group,
    nodeIds: [...new Set((group.nodeIds ?? []).map(String).filter((id) => nodeById.has(id) && !groupIds.has(id)))],
  }));
  const normalizedGroupById = new Map(normalizedGroups.map((group) => [group.id, group]));
  for (const node of normalizedNodes) {
    if (node?.type === "group") {
      delete node.parentId;
      delete node.parentGroupId;
      continue;
    }
    const existingParentId = String(node?.parentId ?? "").trim();
    const legacyParentId = String(node?.parentGroupId ?? "").trim() || legacyChildIds.get(String(node?.id ?? ""));
    const parentId = normalizedGroupById.has(existingParentId)
      ? existingParentId
      : normalizedGroupById.has(legacyParentId)
        ? legacyParentId
        : "";
    if (!parentId) {
      delete node.parentId;
      delete node.parentGroupId;
      continue;
    }
    const legacyPosition = !existingParentId && Boolean(legacyParentId);
    node.parentId = parentId;
    delete node.parentGroupId;
    if (legacyPosition) {
      const groupNode = nodeById.get(parentId);
      const groupX = Number(groupNode?.position?.x ?? 0);
      const groupY = Number(groupNode?.position?.y ?? 0);
      node.position = {
        x: Number(node.position?.x ?? 0) - (Number.isFinite(groupX) ? groupX : 0),
        y: Number(node.position?.y ?? 0) - (Number.isFinite(groupY) ? groupY : 0),
      };
    }
  }
  const membersByGroup = new Map(normalizedGroups.map((group) => [group.id, new Set()]));
  for (const node of normalizedNodes) {
    const parentId = String(node?.parentId ?? "");
    if (parentId && membersByGroup.has(parentId)) membersByGroup.get(parentId).add(String(node.id));
  }
  for (const group of normalizedGroups) {
    const members = membersByGroup.get(group.id);
    if (members?.size) group.nodeIds = [...members];
  }
  return { nodes: normalizedNodes, groups: normalizedGroups };
}

function normalizeAiCanvasRuntimeDocument(document) {
  const result = document && typeof document === "object" && !Array.isArray(document)
    ? document
    : {};
  const nodes = Array.isArray(result.nodes) ? result.nodes : [];
  const edges = Array.isArray(result.edges) ? result.edges : [];
  const normalizedNodes = nodes.map((node) => {
    const type = normalizeRuntimeNodeType(node);
    return {
      ...node,
      type,
      data: normalizeRuntimeNodeData(node, type),
    };
  });
  const nodeIds = new Set(normalizedNodes.map((node) => String(node?.id ?? "")).filter(Boolean));
  const grouping = normalizeAiCanvasRuntimeGrouping(normalizedNodes, result.groups);
  const normalizedEdges = edges.map((edge, index) => {
    const source = String(edge?.source ?? edge?.sourceNodeId ?? "").trim();
    const target = String(edge?.target ?? edge?.targetNodeId ?? "").trim();
    return {
      ...edge,
      id: String(edge?.id ?? `edge-${index + 1}`),
      source,
      target,
      ...(edge?.sourceHandle ?? edge?.sourcePortId ? { sourceHandle: edge?.sourceHandle ?? edge?.sourcePortId } : {}),
      ...(edge?.targetHandle ?? edge?.targetPortId ? { targetHandle: edge?.targetHandle ?? edge?.targetPortId } : {}),
    };
  }).filter((edge) => edge.source && edge.target && nodeIds.has(edge.source) && nodeIds.has(edge.target));
  return {
    ...result,
    nodes: grouping.nodes,
    edges: normalizedEdges,
    ...(grouping.groups.length > 0 || Array.isArray(result.groups) ? { groups: grouping.groups } : {}),
  };
}

/**
 * Convert an AI Canvas document to a JSON-safe, versioned payload.
 * The function does not mutate the caller's document and deliberately keeps
 * asset references as IDs/metadata rather than attempting to resolve URLs.
 */
export function serializeAiCanvasDocument(document) {
  const source = document && typeof document === "object" ? document : {};
  const payload = normalizeAiCanvasRuntimeDocument(source);
  if (payload.version == null) payload.version = AI_CANVAS_DOCUMENT_VERSION;
  return JSON.stringify(payload);
}

/**
 * Read a serialized AI Canvas document. Object input is accepted so runtime
 * adapters can pass an already decoded server response without a stringify/
 * parse round trip.
 */
export function deserializeAiCanvasDocument(serialized, fallback = {}) {
  let value = serialized;
  if (typeof serialized === "string") {
    try {
      value = JSON.parse(serialized);
    } catch {
      value = null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    value = fallback && typeof fallback === "object" && !Array.isArray(fallback) ? fallback : {};
  }
  const result = normalizeAiCanvasRuntimeDocument(value);
  if (result.version == null) result.version = AI_CANVAS_DOCUMENT_VERSION;
  return result;
}

function resolveCreatorApi(dependencies, context) {
  return context?.creatorApi
    ?? context?.api
    ?? dependencies.creatorApi
    ?? defaultCreatorApi;
}

function requireMethod(api, method) {
  if (typeof api?.[method] !== "function") {
    throw new Error(`ai_canvas_creator_api_${method}_unavailable`);
  }
  return api[method].bind(api);
}

function createCreatorApiBridge(creatorApi, canvasProjectId, dependencies = {}) {
  const defaultPurpose = String(dependencies.uploadPurpose ?? "canvas-assets").trim() || "canvas-assets";
  const resolveCanvasId = (value) => normalizeId(value) ?? canvasProjectId;

  const uploadFile = async (file, options = {}) => {
    const method = requireMethod(creatorApi, "uploadFile");
    return method(file, {
      ...options,
      canvasProjectId: resolveCanvasId(options.canvasProjectId),
      purpose: options.purpose ?? defaultPurpose,
    });
  };
  const runCanvasNode = (projectId, nodeId, input = {}, options = {}) => {
    const method = requireMethod(creatorApi, "runCanvasNode");
    const resolvedProjectId = resolveCanvasId(projectId);
    if (!resolvedProjectId) throw new Error("ai_canvas_canvas_project_id_required");
    return method(resolvedProjectId, nodeId, input, options);
  };
  const runCanvasTextNodeStream = (projectId, nodeId, input = {}, options = {}) => {
    const method = requireMethod(creatorApi, "runCanvasTextNodeStream");
    const resolvedProjectId = resolveCanvasId(projectId);
    if (!resolvedProjectId) throw new Error("ai_canvas_canvas_project_id_required");
    return method(resolvedProjectId, nodeId, input, options);
  };
  const createCanvasGenerationBatch = (projectId, input = {}, options = {}) => {
    const method = requireMethod(creatorApi, "createCanvasGenerationBatch");
    const resolvedProjectId = resolveCanvasId(projectId);
    if (!resolvedProjectId) throw new Error("ai_canvas_canvas_project_id_required");
    return method(resolvedProjectId, input, options);
  };

  const bridge = {
    uploadFile,
    uploadAsset: uploadFile,
    runCanvasNode,
    runNode: (nodeId, input = {}, options = {}) => runCanvasNode(canvasProjectId, nodeId, input, options),
    runCanvasTextNodeStream,
    runTextNodeStream: (nodeId, input = {}, options = {}) => (
      runCanvasTextNodeStream(canvasProjectId, nodeId, input, options)
    ),
    createCanvasGenerationBatch,
    createGenerationBatch: (input = {}, options = {}) => (
      createCanvasGenerationBatch(canvasProjectId, input, options)
    ),
  };
  // Preserve the complete host API for existing Canvas features. The stable
  // aliases above only normalize the calls that an upstream runtime needs.
  return new Proxy(bridge, {
    get(target, property, receiver) {
      if (Reflect.has(target, property)) return Reflect.get(target, property, receiver);
      const value = creatorApi?.[property];
      return typeof value === "function" ? value.bind(creatorApi) : value;
    },
    has(target, property) {
      return Reflect.has(target, property) || property in Object(creatorApi);
    },
  });
}

function resolveRuntimeMount(dependencies, runtime) {
  if (typeof dependencies.mountRuntime === "function") return dependencies.mountRuntime;
  if (typeof runtime?.mount === "function") return runtime.mount.bind(runtime);
  return null;
}

/**
 * Create an injectable AI Canvas adapter implementing `{ mount }`.
 *
 * `dependencies.runtime` may be an upstream runtime exposing `mount(surface,
 * context)`, or callers can provide `mountRuntime`. The returned handle keeps
 * `update`/`dispose` ownership local and exposes API/document synchronization
 * helpers for the host shell. There is deliberately no legacy Canvas fallback:
 * a detail route either mounts the upstream runtime or reports a load failure.
 */
export function createAiCanvasRuntimeAdapter(dependencies = {}) {
  const runtime = dependencies.runtime ?? null;

  return {
    version: AI_CANVAS_RUNTIME_ADAPTER_VERSION,
    kind: AI_CANVAS_RUNTIME_KIND,

    async mount(surface, context = {}) {
      const canvasProjectId = normalizeId(
        context.canvasProjectId
          ?? context.projectId
          ?? context.workbench?.ui?.selectedCanvasProjectId,
      );
      const creatorApi = resolveCreatorApi(dependencies, context);
      const creatorApiBridge = createCreatorApiBridge(creatorApi, canvasProjectId, dependencies);
      const catalog = await resolveRuntimeCatalogs(creatorApi, canvasProjectId, context, dependencies);
      let document = deserializeAiCanvasDocument(context.document ?? context.canvasDocument);
      let disposed = false;
      const syncDocument = context.syncDocument ?? dependencies.syncDocument;
      const runtimeMount = resolveRuntimeMount(dependencies, runtime);
      const runtimeContext = {
        ...context,
        canvasProjectId,
        runtime: AI_CANVAS_RUNTIME_KIND,
        runtimeVersion: AI_CANVAS_RUNTIME_ADAPTER_VERSION,
        creatorApi: creatorApiBridge,
        api: creatorApiBridge,
        modelCatalog: catalog.models,
        skillCatalog: catalog.skills,
        document,
        serializeDocument: serializeAiCanvasDocument,
        deserializeDocument: deserializeAiCanvasDocument,
        syncDocument: async (nextDocument, metadata = {}) => {
          document = deserializeAiCanvasDocument(nextDocument, document);
          if (typeof syncDocument === "function") {
            const hostResult = await syncDocument(document, { ...metadata, canvasProjectId });
            return hostResult === undefined ? document : hostResult;
          }
          return document;
        },
      };
      let runtimeHandle = null;
      runtimeHandle = runtimeMount
        ? await runtimeMount(surface, runtimeContext)
        : null;
      const handle = {
        runtime: runtimeHandle,
        api: creatorApiBridge,
        get document() {
          return document;
        },
        serializeDocument: () => serializeAiCanvasDocument(document),
        deserializeDocument: (value, fallback = document) => deserializeAiCanvasDocument(value, fallback),
        async syncDocument(nextDocument, metadata = {}) {
          if (disposed) return false;
          document = deserializeAiCanvasDocument(nextDocument, document);
          const runtimeResult = await runtimeHandle?.syncDocument?.(document, metadata);
          if (typeof syncDocument === "function") {
            const hostResult = await syncDocument(document, { ...metadata, canvasProjectId });
            return hostResult === undefined ? runtimeResult ?? document : hostResult;
          }
          return runtimeResult ?? document;
        },
        async update(next = {}) {
          if (disposed) return false;
          const nextDocument = next.document
            ?? next.canvasDocument
            ?? next.ui?.canvasDocument;
          // Host-originated updates already contain the canonical document. Keep
          // the runtime document current, but do not send it back through
          // syncDocument, otherwise polling can schedule another save request.
          if (nextDocument !== undefined) {
            document = deserializeAiCanvasDocument(nextDocument, document);
            if (next.hostDocumentSync !== false) {
              await handle.syncDocument(document, next);
            }
          }
          return runtimeHandle?.update?.({
            ...next,
            canvasProjectId,
            runtime: AI_CANVAS_RUNTIME_KIND,
            runtimeVersion: AI_CANVAS_RUNTIME_ADAPTER_VERSION,
            creatorApi: creatorApiBridge,
            api: creatorApiBridge,
            modelCatalog: catalog.models,
            skillCatalog: catalog.skills,
            document,
          });
        },
        async dispose() {
          if (disposed) return;
          disposed = true;
          await runtimeHandle?.dispose?.();
        },
        async submitPrompt(input = {}) {
          return runtimeHandle?.submitPrompt?.(input) ?? false;
        },
        async submitAgentPrompt(input = {}) {
          return runtimeHandle?.submitAgentPrompt?.(input) ?? false;
        },
      };
      return handle;
    },
  };
}
