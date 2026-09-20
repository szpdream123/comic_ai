/**
 * Host bridge for the standalone AI Canvas runtime.
 *
 * The runtime is intentionally injected. This module owns the contract between
 * the product shell and the upstream AI Canvas implementation.
 */

import { creatorApi as defaultCreatorApi, defaultUploadLimits, resolveApiUrl } from "../../shared/creator-api.js";

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

function resolveRuntimeModelPricing(model = {}) {
  const merged = {};
  for (const value of [model.pricing, model.pricingJson, model.pricing_json]) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(merged, sanitizeRuntimeCatalogValue(value));
    }
  }
  const extras = {
    baseCredits: model.baseCredits ?? model.base_credits,
    billingMode: model.billingMode ?? model.billing_mode,
    resolutionCredits: model.resolutionCredits ?? model.resolution_credits,
    credits: model.credits,
    displayBaseCost: model.displayBaseCost,
  };
  for (const [key, value] of Object.entries(extras)) {
    if (value !== undefined && merged[key] === undefined) merged[key] = value;
  }
  if (merged.baseCredits === undefined && extras.displayBaseCost !== undefined) {
    merged.baseCredits = extras.displayBaseCost;
  }
  if (merged.base_credits === undefined && merged.baseCredits !== undefined) {
    merged.base_credits = merged.baseCredits;
  }
  if (merged.billing_mode === undefined && merged.billingMode !== undefined) {
    merged.billing_mode = merged.billingMode;
  }
  if (merged.resolution_credits === undefined && merged.resolutionCredits !== undefined) {
    merged.resolution_credits = merged.resolutionCredits;
  }
  return Object.keys(merged).length ? merged : undefined;
}

export function normalizeAiCanvasRuntimeModel(model = {}, category = "text") {
  const modelCode = String(model.modelCode ?? model.model_code ?? model.modelId ?? model.model_id ?? model.code ?? model.id ?? "").trim();
  if (!modelCode) return null;
  const capabilities = model.capabilities && typeof model.capabilities === "object"
    ? { ...model.capabilities }
    : {};
  const modelLabel = String(model.modelLabel ?? model.model_label ?? model.displayName ?? model.display_name ?? model.displayModelName ?? model.modelName ?? model.model_name ?? model.name ?? model.label ?? "").trim();
  const modelName = String(model.displayName ?? model.display_name ?? model.displayModelName ?? model.modelName ?? model.model_name ?? model.name ?? model.label ?? modelCode).trim() || modelCode;
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
    modelLabel: ["文本", "图片", "视频", "音频", "模型"].includes(modelLabel) ? modelName : (modelLabel || modelName),
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
    pricing: resolveRuntimeModelPricing(model),
    remark: String(model.remark ?? model.notes ?? model.summary ?? model.description ?? "").trim() || undefined,
    description: String(model.remark ?? model.notes ?? model.summary ?? model.description ?? "").trim() || undefined,
    inputModalities: Array.isArray(model.inputModalities)
      ? model.inputModalities.map((value) => String(value).trim()).filter(Boolean)
      : undefined,
  };
}

function normalizeAiCanvasSkillFileName(value) {
  return String(value ?? "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}

function isAiCanvasSkillEntryFileName(value) {
  return normalizeAiCanvasSkillFileName(value).split("/").pop()?.toLowerCase() === "skill.md";
}

function listAiCanvasRuntimeSkillFiles(skill = {}) {
  const rows = [];
  const pushList = (list) => {
    if (!Array.isArray(list)) return;
    for (const file of list) {
      if (typeof file === "string") {
        const name = normalizeAiCanvasSkillFileName(file);
        if (name) rows.push({ name, content: "" });
        continue;
      }
      const name = normalizeAiCanvasSkillFileName(file?.name ?? file?.fileName);
      if (!name) continue;
      rows.push({ name, content: typeof file?.content === "string" ? file.content : "" });
    }
  };
  pushList(skill.files);
  const detail = skill.detail && typeof skill.detail === "object" && !Array.isArray(skill.detail)
    ? skill.detail
    : {};
  pushList(detail.files);
  const merged = new Map();
  for (const file of rows) {
    const previous = merged.get(file.name);
    if (!previous || (!String(previous.content ?? "").trim() && String(file.content ?? "").trim())) {
      merged.set(file.name, file);
    }
  }
  return [...merged.values()];
}

function resolveAiCanvasSkillEntryContent(skill = {}, files = []) {
  const entry = files.find((file) => isAiCanvasSkillEntryFileName(file.name));
  const fromFile = String(entry?.content ?? "").trim();
  if (fromFile) return fromFile;
  const fromContent = typeof skill.content === "string" ? skill.content.trim() : "";
  if (fromContent) return fromContent;
  const detail = skill.detail && typeof skill.detail === "object" && !Array.isArray(skill.detail)
    ? skill.detail
    : {};
  return String(detail.introduction ?? detail.intro ?? "").trim();
}

function extractReferencedAiCanvasSkillFiles(entryContent, files = []) {
  const text = String(entryContent ?? "");
  const candidates = new Set();
  const add = (raw) => {
    const cleaned = String(raw ?? "").trim().replace(/\\/g, "/").replace(/^\.\//, "").split(/[?#]/)[0];
    if (!cleaned || /^[a-z]+:\/\//i.test(cleaned) || cleaned.startsWith("#")) return;
    const name = normalizeAiCanvasSkillFileName(cleaned);
    if (!name || isAiCanvasSkillEntryFileName(name)) return;
    candidates.add(name);
  };
  for (const match of text.matchAll(/\[[^\]]*\]\(\s*<?([^)\s>]+)>?\s*\)/g)) add(match[1]);
  for (const match of text.matchAll(/`([^`\n]+)`/g)) add(match[1]);
  for (const match of text.matchAll(/(?:^|[\s("'=])((?:\.\/)?(?:[^\s"'()]+\/)+[^\s"'()]+\.(?:md|markdown|txt|json))/gi)) {
    add(match[1]);
  }
  const selected = [];
  const seen = new Set();
  const take = (file) => {
    if (!file || seen.has(file.name) || isAiCanvasSkillEntryFileName(file.name)) return;
    seen.add(file.name);
    selected.push(file);
  };
  for (const candidate of candidates) {
    const exact = files.find((file) => file.name === candidate);
    if (exact) {
      take(exact);
      continue;
    }
    const prefix = candidate.endsWith("/") ? candidate : `${candidate}/`;
    let matchedPrefix = false;
    for (const file of files) {
      if (file.name.startsWith(prefix)) {
        matchedPrefix = true;
        take(file);
      }
    }
    if (matchedPrefix || candidate.includes("/")) continue;
    const base = candidate.split("/").pop();
    for (const file of files) {
      if (file.name.split("/").pop() === base) take(file);
    }
  }
  return selected;
}

function composeAiCanvasRuntimeSkillContent(skill = {}) {
  const files = listAiCanvasRuntimeSkillFiles(skill);
  const entryContent = resolveAiCanvasSkillEntryContent(skill, files);
  const referenced = extractReferencedAiCanvasSkillFiles(entryContent, files)
    .map((file) => {
      const body = String(file.content ?? "").trim();
      return body ? `【${file.name}】\n${body}` : "";
    })
    .filter(Boolean);
  return [entryContent, ...referenced].filter(Boolean).join("\n\n");
}

export function normalizeAiCanvasRuntimeSkill(skill = {}) {
  const id = String(skill.id ?? skill.skillId ?? "").trim();
  if (!id) return null;
  return {
    id,
    name: String(skill.name ?? skill.title ?? skill.displayName ?? skill.display_name ?? skill.skillName ?? "未命名 Skill").trim() || "未命名 Skill",
    description: String(skill.description ?? skill.summary ?? "").trim(),
    summary: String(skill.summary ?? skill.description ?? "").trim(),
    category: String(skill.category ?? "general").trim() || "general",
    source: String(skill.source ?? (skill.ownerUserId ? "mine" : "official")).trim() || "official",
    version: String(skill.version ?? "").trim() || undefined,
    // The runtime picker expects content, while the server remains the source
    // of truth for execution. Keep only an optional, already-sanitized body.
    content: composeAiCanvasRuntimeSkillContent(skill),
  };
}

function mergeAiCanvasRuntimeSkillDetail(skill, detailPayload) {
  const payload = detailPayload && typeof detailPayload === "object" && !Array.isArray(detailPayload)
    ? detailPayload
    : {};
  const nested = payload.skill && typeof payload.skill === "object" && !Array.isArray(payload.skill)
    ? payload.skill
    : payload.data?.skill && typeof payload.data.skill === "object" && !Array.isArray(payload.data.skill)
      ? payload.data.skill
      : payload;
  const files = Array.isArray(payload.files)
    ? payload.files
    : Array.isArray(payload.data?.files)
      ? payload.data.files
      : Array.isArray(nested?.files)
        ? nested.files
        : Array.isArray(skill?.files)
          ? skill.files
          : [];
  return { ...skill, ...nested, files };
}

export async function hydrateAiCanvasRuntimeSkillRows(creatorApi, rows) {
  if (!Array.isArray(rows) || typeof creatorApi?.getSkillDetail !== "function") return rows;
  return Promise.all(rows.map(async (skill) => {
    const id = String(skill?.id ?? skill?.skillId ?? "").trim();
    if (!id) return skill;
    const existingFiles = listAiCanvasRuntimeSkillFiles(skill);
    if (existingFiles.some((file) => String(file.content ?? "").trim())
      || (String(skill.content ?? "").trim() && existingFiles.length === 0)) {
      return skill;
    }
    try {
      return mergeAiCanvasRuntimeSkillDetail(skill, await creatorApi.getSkillDetail(id));
    } catch {
      return skill;
    }
  }));
}

async function resolveRuntimeCatalogs(creatorApi, canvasProjectId, context, dependencies) {
  const rowsFromPayload = (payload, keys) => {
    if (Array.isArray(payload)) return payload;
    for (const source of [payload, payload?.data]) {
      if (!source || typeof source !== "object" || Array.isArray(source)) continue;
      for (const key of keys) {
        if (Array.isArray(source[key])) return source[key];
      }
    }
    return [];
  };
  const modelCatalog = context.modelCatalog ?? context.models ?? dependencies.modelCatalog;
  const skillCatalog = context.skillCatalog ?? context.skills ?? dependencies.skillCatalog;
  const modelsPromise = modelCatalog !== undefined
    ? Promise.resolve(modelCatalog)
    : typeof creatorApi?.listCanvasAgentModels === "function" && canvasProjectId
      ? creatorApi.listCanvasAgentModels(canvasProjectId)
      : Promise.resolve([]);
  const generationPromise = modelCatalog !== undefined || typeof creatorApi?.listGlobalGenerationConfig !== "function"
    ? Promise.resolve([])
    : creatorApi.listGlobalGenerationConfig().catch(() => null).then((payload) => (
      payload == null ? [] : [{ mediaType: null, payload }]
    ));
  const skillsPromise = skillCatalog !== undefined
    ? Promise.resolve(skillCatalog)
    : typeof creatorApi?.getSkills === "function"
      ? Promise.all([
          creatorApi.getSkills({ page: 1, pageSize: 50 }),
          typeof creatorApi?.getMySkills === "function"
            ? creatorApi.getMySkills().catch(() => ({ items: [] }))
            : Promise.resolve({ items: [] }),
        ]).then(([catalogPayload, minePayload]) => {
          const catalogRows = rowsFromPayload(catalogPayload, ["items", "skills"]).map((skill) => ({
            ...skill,
            source: skill?.source ?? (skill?.ownerUserId ? "mine" : "official"),
          }));
          const mineRows = rowsFromPayload(minePayload, ["items", "skills"]).map((skill) => ({
            ...skill,
            source: "mine",
          }));
          const byId = new Map();
          for (const skill of [...catalogRows, ...mineRows]) {
            const id = String(skill?.id ?? skill?.skillId ?? "").trim();
            if (id) byId.set(id, skill);
          }
          return [...byId.values()];
        })
      : Promise.resolve([]);
  const [modelsPayload, generationPayload, skillsPayload] = await Promise.allSettled([modelsPromise, generationPromise, skillsPromise]);
  const modelRows = modelsPayload.status === "fulfilled"
    ? rowsFromPayload(modelsPayload.value, ["models", "items"])
    : [];
  const skillRows = skillsPayload.status === "fulfilled"
    ? rowsFromPayload(skillsPayload.value, ["items", "skills"])
    : [];
  const generationRows = generationPayload.status === "fulfilled"
    ? generationPayload.value.flatMap(({ mediaType, payload }) => (
      rowsFromPayload(payload, ["models", "items"]).map((model) => ({ ...model, mediaType: model?.mediaType ?? mediaType }))
    ))
    : [];
  const models = [];
  const seenModelKeys = new Set();
  for (const model of [...modelRows, ...generationRows]) {
    const normalized = normalizeAiCanvasRuntimeModel(model, model.mediaType ?? model.media_type ?? model.mediaKind ?? "text");
    if (!normalized) continue;
    const key = `${normalized.category}:${normalized.modelCode}`;
    if (seenModelKeys.has(key)) continue;
    seenModelKeys.add(key);
    models.push(normalized);
  }
  return {
    models,
    skills: skillRows.map(normalizeAiCanvasRuntimeSkill).filter(Boolean),
  };
}

export function resolveAiCanvasRuntimeNodeMediaKind(type, data = {}) {
  const nodeType = String(type ?? data?.type ?? "").trim();
  if (nodeType === "ai-image" || nodeType === "ai-animation" || nodeType === "ai-panorama") return "image";
  if (nodeType === "ai-video") return "video";
  if (nodeType === "ai-audio") return "audio";
  if (
    nodeType === "ai-text"
    || nodeType === "ai-markdown"
    || nodeType === "ai-storyboard"
    || nodeType === "ai-shotlist"
    || nodeType === "ai-director"
  ) return "text";
  const mediaKind = String(data?.mediaKind ?? "").trim();
  if (["image", "video", "audio", "text"].includes(mediaKind)) return mediaKind;
  return "text";
}

export function toAiCanvasRuntimeSlashModelId(modelId, category = "text") {
  const value = String(modelId ?? "").trim();
  if (!value) return null;
  const slash = value.indexOf("/");
  if (slash > 0) {
    return { model: value, provider: value.slice(0, slash) };
  }
  const kind = String(category ?? "text").trim() || "text";
  return {
    model: `general/comic-ai/${kind}/${value}`,
    provider: "general",
  };
}

export function applyAiCanvasRuntimeNodeModel(data = {}, type = "") {
  const next = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  const nodeType = String(type || next.type || "").trim();
  if (!nodeType.startsWith("ai-")) return next;
  const raw = String(next.model ?? "").trim() || String(next.modelCode ?? "").trim();
  const slash = toAiCanvasRuntimeSlashModelId(raw, resolveAiCanvasRuntimeNodeMediaKind(nodeType, next));
  if (!slash) return next;
  next.model = slash.model;
  if (!String(next.provider ?? "").trim()) next.provider = slash.provider;
  return next;
}

export function normalizeAiCanvasRuntimeProjectDefaultModels(defaultModels) {
  if (!defaultModels || typeof defaultModels !== "object" || Array.isArray(defaultModels)) return undefined;
  const next = {};
  for (const [kind, value] of Object.entries(defaultModels)) {
    const slash = toAiCanvasRuntimeSlashModelId(value, kind);
    if (slash?.model) next[kind] = slash.model;
  }
  return Object.keys(next).length ? next : undefined;
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
  if (nextType === "ai-video" || nextType === "source-video") {
    Object.assign(next, normalizeRuntimeVideoPoster(next));
  }
  const pendingTaskId = String(next.taskId ?? next.lastTaskId ?? next.generationTaskId ?? next.pendingTask?.taskId ?? "").trim();
  if (pendingTaskId) {
    next.taskId = pendingTaskId;
    next.lastTaskId = pendingTaskId;
    next.generationTaskId = pendingTaskId;
  }
  const rawStatus = String(next.status ?? "").trim().toLowerCase();
  if (previousType !== "send" && ["loading", "running", "queued", "processing", "pending", "submitted"].includes(rawStatus)) {
    next.status = "loading";
  } else if (rawStatus === "completed" || rawStatus === "succeeded") {
    next.status = "success";
  }
  return applyAiCanvasRuntimeNodeModel(next, nextType);
}

function looksLikeCanvasVideoUrl(value) {
  const url = String(value ?? "").trim();
  if (!url) return false;
  if (/\.(mp4|webm|mov|m4v|mkv)(?:$|[?#])/i.test(url)) return true;
  if (/[?&]thumbnail=1(?:&|$)/i.test(url)) return false;
  return false;
}

function normalizeRuntimeVideoPoster(data = {}) {
  const videoUrl = String(data.videoUrl ?? data.url ?? data.sourceUrl ?? "").trim();
  const previewUrl = String(data.previewUrl ?? "").trim();
  const next = {};
  if (!String(data.videoUrl ?? "").trim() && videoUrl) next.videoUrl = videoUrl;
  else if (!String(data.videoUrl ?? "").trim() && looksLikeCanvasVideoUrl(previewUrl)) next.videoUrl = previewUrl;
  const poster = String(
    data.thumbnailUrl
    ?? data.posterUrl
    ?? data.coverImageUrl
    ?? data.videoPosterUrl
    ?? "",
  ).trim();
  if (poster && poster !== videoUrl && !looksLikeCanvasVideoUrl(poster)) {
    next.thumbnailUrl = poster;
    if (!String(data.posterUrl ?? "").trim()) next.posterUrl = poster;
  } else if (data.storageObjectId) {
    next.thumbnailUrl = `/api/storage/objects/${encodeURIComponent(String(data.storageObjectId).trim())}/content?thumbnail=1`;
  } else if (looksLikeCanvasVideoUrl(data.thumbnailUrl) || String(data.thumbnailUrl ?? "").trim() === videoUrl) {
    next.thumbnailUrl = "";
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
  return context?.workbench?.api
    ?? context?.creatorApi
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

function dataUrlToFile(dataUrl, fileName) {
  const match = String(dataUrl ?? "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match || typeof atob !== "function" || typeof File !== "function") return null;
  const type = String(match[1] || "image/png").trim() || "image/png";
  const extension = type === "image/jpeg" || type === "image/jpg"
    ? ".jpg"
    : type === "image/webp"
      ? ".webp"
      : type === "image/avif"
        ? ".avif"
        : ".png";
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const resolvedName = String(fileName ?? "cover").replace(/\.[^.]+$/, "") + extension;
  return new File([bytes], resolvedName, { type });
}

function createCreatorApiBridge(creatorApi, canvasProjectId, dependencies = {}) {
  const defaultPurpose = String(dependencies.uploadPurpose ?? "canvas-assets").trim() || "canvas-assets";
  const resolveCanvasId = (value) => normalizeId(value) ?? canvasProjectId;
  const customStyleOwnerIds = new Map();

  const uploadFile = async (file, options = {}) => {
    const api = dependencies.getCreatorApi?.() ?? creatorApi ?? defaultCreatorApi;
    const method = requireMethod(api, "uploadFile");
    const requestedCanvasProjectId = options.canvasProjectId;
    return method(file, {
      ...options,
      purpose: options.purpose ?? options.category ?? defaultPurpose,
      projectId: options.projectId ?? null,
      canvasProjectId: requestedCanvasProjectId === null
        ? null
        : resolveCanvasId(requestedCanvasProjectId),
      uploadLimits: options.uploadLimits ?? defaultUploadLimits,
    });
  };
  const persistCustomStyle = async (style = {}) => {
    const api = dependencies.getCreatorApi?.() ?? creatorApi ?? defaultCreatorApi;
    const name = String(style.name ?? "").trim();
    const prompt = String(style.prompt ?? "").trim();
    if (!name) return style;
    const thumbnail = String(style.thumbnail ?? "").trim();
    const content = prompt || `${name}视觉风格，统一构图、色彩、光影、材质与细节表现。`;
    const payload = {
      title: name,
      category: "image_style",
      summary: String(style.description ?? prompt ?? "").trim().slice(0, 240),
      content,
      priceCredits: 0,
      publish: true,
    };
    let coverImageUrl = "";
    let coverStorageObjectId = "";
    if (thumbnail.startsWith("data:")) {
      const file = dataUrlToFile(thumbnail, `${name}.png`);
      if (file) {
        try {
          const uploaded = await uploadFile(file, {
            category: "prompt-marketplace-covers",
            purpose: "prompt-marketplace-covers",
            canvasProjectId: null,
            projectId: null,
            uploadLimits: defaultUploadLimits,
          });
          coverImageUrl = String(
            uploaded?.urls?.previewUrl
            ?? uploaded?.urls?.sourceUrl
            ?? uploaded?.upload?.previewUrl
            ?? uploaded?.upload?.publicUrl
            ?? "",
          ).trim();
          coverStorageObjectId = String(uploaded?.upload?.storageObjectId ?? uploaded?.storageObject?.id ?? "").trim();
        } catch (error) {
          console.warn("[保存画风] 封面上传失败，提示词已保存", error);
        }
      }
    } else if (thumbnail && !thumbnail.startsWith("data:")) {
      coverImageUrl = thumbnail;
      const objectIdMatch = thumbnail.match(/\/api\/storage\/objects\/([^/?#]+)/i);
      if (objectIdMatch?.[1]) coverStorageObjectId = decodeURIComponent(objectIdMatch[1]);
    }
    if (coverImageUrl && !coverImageUrl.startsWith("data:")) payload.coverImageUrl = coverImageUrl;
    if (coverStorageObjectId) payload.coverStorageObjectId = coverStorageObjectId;
    const existingId = customStyleOwnerIds.get(String(style.id ?? ""));
    let itemId = existingId;
    if (existingId && typeof api?.updatePromptMarketplaceItem === "function") {
      const updated = await api.updatePromptMarketplaceItem(existingId, payload);
      itemId = String(updated?.item?.id ?? existingId);
    } else {
      const created = await requireMethod(api, "createPromptMarketplaceItem")(payload);
      itemId = String(created?.item?.id ?? created?.id ?? "");
    }
    if (itemId) customStyleOwnerIds.set(String(style.id ?? itemId), itemId);
    return { ...style, id: itemId || String(style.id ?? "") };
  };
  const extractPromptSkillItems = (payload) => {
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.data?.items)) return payload.data.items;
    if (Array.isArray(payload)) return payload;
    return [];
  };
  const mapImageStyleSkill = (item, { isCustom }) => {
    const id = String(item?.id ?? "").trim();
    const name = String(item?.title ?? item?.name ?? "").trim();
    const coverStorageObjectId = String(item?.coverStorageObjectId ?? item?.cover_storage_object_id ?? "").trim();
    const coverImageUrl = String(item?.coverImageUrl ?? item?.cover_image_url ?? "").trim();
    const thumbnail = /^https?:\/\//i.test(coverImageUrl)
      ? coverImageUrl
      : coverStorageObjectId
        ? `/api/storage/objects/${encodeURIComponent(coverStorageObjectId)}/content?proxy=1`
        : coverImageUrl;
    return {
      id,
      nodeType: "ai-image",
      name,
      prompt: String(item?.promptContent ?? item?.prompt_content ?? item?.content ?? "").trim(),
      description: String(item?.summary ?? item?.description ?? "").trim(),
      thumbnail: thumbnail ? resolveApiUrl(thumbnail) : "",
      createdAt: Date.parse(String(item?.updatedAt ?? item?.updated_at ?? "")) || Date.now(),
      official: item?.official === true,
      isCustom,
    };
  };
  const loadCustomStyles = async () => {
    const apis = [
      dependencies.getCreatorApi?.() ?? creatorApi,
      defaultCreatorApi,
    ].filter((api, index, list) => (
      api
      && typeof api.getPromptSkills === "function"
      && list.indexOf(api) === index
    ));
    const request = { category: "image_style", page: 1, pageSize: 100 };
    let lastError = null;
    for (const api of apis) {
      try {
        const [catalog, library] = await Promise.all([
          api.getPromptSkills({ ...request, source: "official" }),
          api.getPromptSkills({ ...request, source: "private" }),
        ]);
        const official = extractPromptSkillItems(catalog)
          .filter((item) => !String(item?.category ?? item?.promptCategory ?? "") || String(item?.category ?? item?.promptCategory ?? "") === "image_style")
          .map((item) => mapImageStyleSkill({ ...item, official: item?.official !== false }, { isCustom: false }));
        const privateOwned = extractPromptSkillItems(library)
          .filter((item) => item && item.official !== true && (
            item.owned === true
            || item.userRelationType === "owner"
            || item.user_relation_type === "owner"
          ))
          .map((item) => {
            const mapped = mapImageStyleSkill(item, { isCustom: true });
            if (mapped.id) customStyleOwnerIds.set(mapped.id, mapped.id);
            return mapped;
          });
        const byId = new Map();
        for (const style of [...official, ...privateOwned]) {
          if (style.id && style.name) byId.set(style.id, style);
        }
        return [...byId.values()];
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError) console.warn("[加载画风] 接口失败", lastError);
    return [];
  };
  const deleteCustomStyle = async (styleId) => {
    const api = dependencies.getCreatorApi?.() ?? creatorApi ?? defaultCreatorApi;
    const itemId = customStyleOwnerIds.get(String(styleId ?? "")) || String(styleId ?? "");
    if (!itemId) return;
    await requireMethod(api, "deletePromptMarketplaceItem")(itemId);
    customStyleOwnerIds.delete(String(styleId ?? ""));
    customStyleOwnerIds.delete(itemId);
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
    persistCustomStyle,
    loadCustomStyles,
    deleteCustomStyle,
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
      const creatorApiBridge = createCreatorApiBridge(creatorApi, canvasProjectId, {
        ...dependencies,
        getCreatorApi: () => resolveCreatorApi(dependencies, context),
      });
      let catalog = { models: [], skills: [] };
      const catalogPromise = resolveRuntimeCatalogs(creatorApi, canvasProjectId, context, dependencies);
      let document = deserializeAiCanvasDocument(context.document ?? context.canvasDocument);
      let disposed = false;
      const syncDocument = context.syncDocument ?? dependencies.syncDocument;
      const runtimeMount = resolveRuntimeMount(dependencies, runtime);
      const mergeRuntimeSkillCatalog = (current = [], incoming) => {
        if (!Array.isArray(incoming)) return incoming ?? current;
        const byId = new Map();
        for (const skill of current) {
          const id = String(skill?.id ?? skill?.skillId ?? "").trim();
          if (id) byId.set(id, skill);
        }
        for (const skill of incoming) {
          const id = String(skill?.id ?? skill?.skillId ?? "").trim();
          if (!id) continue;
          const previous = byId.get(id);
          byId.set(id, {
            ...previous,
            ...skill,
            content: String(skill?.content ?? "").trim() || previous?.content || skill.content,
          });
        }
        return [...byId.values()];
      };
      const injectRuntimeCatalogs = async (next = {}) => {
        if (disposed) return false;
        if (next.modelCatalog !== undefined || next.models !== undefined) {
          catalog.models = next.modelCatalog ?? next.models;
        }
        if (next.skillCatalog !== undefined || next.skills !== undefined) {
          catalog.skills = mergeRuntimeSkillCatalog(catalog.skills, next.skillCatalog ?? next.skills);
        }
        runtimeContext.modelCatalog = catalog.models;
        runtimeContext.skillCatalog = catalog.skills;
        return runtimeHandle?.update?.({
          modelCatalog: catalog.models,
          skillCatalog: catalog.skills,
        });
      };
      const runtimeContext = {
        ...context,
        canvasProjectId,
        runtime: AI_CANVAS_RUNTIME_KIND,
        runtimeVersion: AI_CANVAS_RUNTIME_ADAPTER_VERSION,
        creatorApi: creatorApiBridge,
        api: creatorApiBridge,
        onGenerationTaskCreated: context.onGenerationTaskCreated,
        taskCenterActiveCount: context.taskCenterActiveCount,
        injectRuntimeCatalogs,
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
      void creatorApiBridge.loadCustomStyles?.().then((styles) => {
        if (!Array.isArray(styles) || styles.length === 0) return;
        const store = globalThis.__COMIC_AI_CANVAS_RUNTIME__?.useAppStore;
        store?.setState?.({ customStyles: styles });
        store?.getState?.()?.loadCustomStyles?.();
      }).catch(() => {});
      const catalogsReady = catalogPromise.then(async (resolved) => {
        if (disposed) return catalog;
        catalog.models = resolved.models;
        catalog.skills = mergeRuntimeSkillCatalog(catalog.skills, resolved.skills);
        if (catalog.models.length > 0 || catalog.skills.length > 0) {
          await injectRuntimeCatalogs({
            modelCatalog: catalog.models,
            skillCatalog: catalog.skills,
          });
        }
        return catalog;
      }).catch(() => catalog);
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
        catalogsReady,
        async update(next = {}) {
          if (disposed) return false;
          if (next.modelCatalog !== undefined || next.models !== undefined) {
            catalog.models = next.modelCatalog ?? next.models;
          }
          if (next.skillCatalog !== undefined || next.skills !== undefined) {
            catalog.skills = mergeRuntimeSkillCatalog(catalog.skills, next.skillCatalog ?? next.skills);
          }
          const nextDocument = Object.prototype.hasOwnProperty.call(next, "document")
            ? next.document
            : next.canvasDocument;
          // Only apply an explicit host document. Chrome-only updates pass `ui`
          // and must not clone the canvas back into the runtime store, otherwise
          // autosave treats the new node/edge identities as an edit.
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
            ...(Object.prototype.hasOwnProperty.call(next, "taskCenterActiveCount")
              ? { taskCenterActiveCount: next.taskCenterActiveCount }
              : {}),
            modelCatalog: catalog.models,
            skillCatalog: catalog.skills,
            ...(nextDocument !== undefined ? { document } : {}),
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
