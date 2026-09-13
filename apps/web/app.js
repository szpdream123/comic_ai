import { creatorApi, resolveApiUrl } from "./src/shared/creator-api.js";
import {
  consumeFirstLoginOnboarding,
  markFirstLoginOnboarding,
} from "./src/features/production-workbench/first-login-onboarding.js";
import { normalizeAiCanvasRuntimeGrouping } from "./src/features/new-canvas/ai-canvas-runtime-adapter.js";
import { matchCanvasRuntimeCatalogModel, resolveCanvasRuntimeNodeCreditCost } from "./src/features/production-workbench/generation-control-menu.js";

const root = document.querySelector("#creator-app");
const productionWorkbenchPromise = root
  ? import("./src/features/production-workbench/index.js?skill-media-upload=5")
  : null;
let aiCanvasRuntimePromise;
let aiCanvasRuntimeStorePromise;
let aiCanvasRuntimeGlobalStyle;

function acquireAiCanvasRuntimeGlobalStyle() {
  if (aiCanvasRuntimeGlobalStyle?.isConnected) {
    return aiCanvasRuntimeGlobalStyle;
  }
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
   stylesheet.href = "/ai-canvas-runtime/assets/runtime-brand-overrides.css?v=20260912-20";
  stylesheet.dataset.aiCanvasRuntimeGlobalStyle = "true";
  document.head?.prepend(stylesheet);
  aiCanvasRuntimeGlobalStyle = stylesheet;
  return stylesheet;
}

function releaseAiCanvasRuntimeGlobalStyle(stylesheet) {
  if (stylesheet !== aiCanvasRuntimeGlobalStyle) return;
  stylesheet?.remove?.();
  aiCanvasRuntimeGlobalStyle = null;
}

function normalizeAiCanvasTheme(theme) {
  return String(theme ?? "").toLowerCase() === "light" ? "light" : "dark";
}

function createAiCanvasRuntimeThemeBridge(surface, theme) {
  const documentElement = document.documentElement;
  const previousTheme = documentElement?.getAttribute?.("data-theme") ?? null;
  const previousSurfaceTheme = surface?.getAttribute?.("data-theme") ?? null;
  let currentTheme = normalizeAiCanvasTheme(theme);
  const applyTheme = () => {
    if (documentElement?.getAttribute?.("data-theme") !== currentTheme) {
      documentElement?.setAttribute?.("data-theme", currentTheme);
    }
    if (surface?.getAttribute?.("data-theme") !== currentTheme) {
      surface?.setAttribute?.("data-theme", currentTheme);
    }
  };
  applyTheme();
  const observer = typeof MutationObserver === "function" && documentElement
    ? new MutationObserver(applyTheme)
    : null;
  observer?.observe(documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return {
    update(themeValue) {
      currentTheme = normalizeAiCanvasTheme(themeValue);
      applyTheme();
    },
    dispose() {
      observer?.disconnect?.();
      if (previousTheme === null) documentElement?.removeAttribute?.("data-theme");
      else documentElement?.setAttribute?.("data-theme", previousTheme);
      if (previousSurfaceTheme === null) surface?.removeAttribute?.("data-theme");
      else surface?.setAttribute?.("data-theme", previousSurfaceTheme);
    },
  };
}

const AI_CANVAS_MASCOT_VISIBLE_STORAGE_KEY = "ai-canvas.mascot.visible";

function shouldShowAiCanvasRuntimeMascot() {
  try {
    return localStorage.getItem(AI_CANVAS_MASCOT_VISIBLE_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

function persistAiCanvasRuntimeMascotVisible(visible) {
  try {
    localStorage.setItem(AI_CANVAS_MASCOT_VISIBLE_STORAGE_KEY, visible ? "true" : "false");
  } catch {}
}

function createAiCanvasRuntimeConfigBridge(store, theme) {
  if (!store?.getState || !store?.setState) {
    return { update() {}, dispose() {} };
  }
  let currentTheme = normalizeAiCanvasTheme(theme);
  let mascotHiddenByUser = shouldShowAiCanvasRuntimeMascot() === false;
  const applyConfig = () => {
    const state = store.getState();
    const config = state?.config;
    if (!config || typeof config !== "object") return;
    const canvasBackground = currentTheme === "light" ? "off-white" : "default";
    const mascotVisible = mascotHiddenByUser ? false : true;
    if (
      config.theme === currentTheme
      && config.canvasBackground === canvasBackground
      && config.mascotVisible === mascotVisible
    ) return;
    store.setState({
      config: {
        ...config,
        theme: currentTheme,
        canvasBackground,
        mascotVisible,
      },
    });
  };
  applyConfig();
  const unsubscribe = store.subscribe?.((nextState, previousState) => {
    if (nextState?.config === previousState?.config) return;
    if (previousState?.configHydrated !== false && nextState?.configHydrated !== false) {
      if (previousState?.config?.mascotVisible === true && nextState?.config?.mascotVisible === false) {
        mascotHiddenByUser = true;
        persistAiCanvasRuntimeMascotVisible(false);
      }
      if (previousState?.config?.mascotVisible === false && nextState?.config?.mascotVisible === true) {
        mascotHiddenByUser = false;
        persistAiCanvasRuntimeMascotVisible(true);
      }
    }
    const expectedBackground = currentTheme === "light" ? "off-white" : "default";
    const expectedMascotVisible = mascotHiddenByUser ? false : true;
    if (
      nextState?.config?.theme === currentTheme
      && nextState?.config?.canvasBackground === expectedBackground
      && nextState?.config?.mascotVisible === expectedMascotVisible
    ) {
      return;
    }
    queueMicrotask(applyConfig);
  });
  return {
    update(themeValue) {
      currentTheme = normalizeAiCanvasTheme(themeValue);
      applyConfig();
    },
    dispose() {
      unsubscribe?.();
    },
  };
}

function resolveAiCanvasRuntimeModelPricing(model = {}) {
  const merged = {};
  for (const value of [model?.pricing, model?.pricingJson, model?.pricing_json]) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(merged, value);
    }
  }
  const extras = {
    baseCredits: model?.baseCredits ?? model?.base_credits,
    billingMode: model?.billingMode ?? model?.billing_mode,
    resolutionCredits: model?.resolutionCredits ?? model?.resolution_credits,
    credits: model?.credits,
    displayBaseCost: model?.displayBaseCost,
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

function createAiCanvasRuntimeCatalogBridge(store, context = {}) {
  if (!store?.getState || !store?.setState) return { update() {}, dispose() {} };
  const originalState = store.getState();
  const originalConfig = originalState?.config;
  const originalSkills = originalState?.userSkills;
  const backendProviderId = "comic-ai-backend";
  const backendProjectId = String(context.currentProjectId ?? context.canvasProjectId ?? "").trim();
  const backendBaseUrl = backendProjectId && typeof location !== "undefined"
    ? `${location.origin}/api/canvas/${encodeURIComponent(backendProjectId)}/assistant`
    : "";
  const sanitizeCatalogValue = (value) => {
    if (Array.isArray(value)) return value.map(sanitizeCatalogValue);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !/(?:api[_-]?key|token|secret|password|credential)/iu.test(key))
      .map(([key, nested]) => [key, sanitizeCatalogValue(nested)]));
  };
  const normalizeExecutionProfile = (profile) => {
    if (Array.isArray(profile)) return profile.map(normalizeExecutionProfile);
    if (!profile || typeof profile !== "object") {
      return typeof profile === "string" ? profile.replaceAll("{{modelId}}", "{{model}}") : profile;
    }
    return Object.fromEntries(Object.entries(profile).map(([key, value]) => [key, normalizeExecutionProfile(value)]));
  };
  const createBackendMediaExecutionProfile = (mediaKind) => ({
    preset: "custom",
    protocol: {
      version: 2,
      mode: "async",
      auth: { type: "none" },
      submit: {
        method: "POST",
        path: mediaKind === "video" ? "/videos/generations" : "/images/generations",
        bodyEncoding: "json",
        body: {
          model: "{{model}}",
          prompt: "{{prompt}}",
          images: "{{imageUrls}}",
          referenceImages: "{{referenceImageUrls}}",
          ...(mediaKind === "video"
            ? {
              referenceVideos: "{{referenceVideoUrls}}",
              referenceAudios: "{{referenceAudioUrls}}",
              firstFrame: "{{firstImage}}",
              lastFrame: "{{lastImage}}",
              duration: "{{duration}}",
              aspectRatio: "{{aspectRatio}}",
              resolution: "{{resolution}}",
              generateAudio: "{{generateAudio}}",
            }
            : {}),
        },
      },
      response: {
        type: "json",
        taskIdPath: "data.0.task_id",
      },
      poll: {
        method: "GET",
        path: "/tasks/{{submit.data.0.task_id}}",
        response: {
          statusPath: "data.status",
          successValues: ["completed"],
          failureValues: ["failed", "canceled", "manual_review_required"],
          result: {
            urlPath: mediaKind === "video" ? "data.result.videos.*.url" : "data.result.images.*.url",
          },
          errorPath: "data.error",
        },
        intervalMs: 15_000,
        maxDurationMs: 30 * 60 * 1_000,
      },
    },
  });
  const normalizeModels = (models) => (Array.isArray(models) ? models : [])
    .map((model) => {
      const code = String(model?.modelCode ?? model?.model_code ?? model?.modelId ?? model?.model_id ?? model?.code ?? model?.id ?? "").trim();
      if (!code) return null;
      const category = String(model?.category ?? model?.mediaType ?? model?.media_type ?? model?.mediaKind ?? "text").trim().toLowerCase();
      const modelLabel = String(model?.modelLabel ?? model?.model_label ?? model?.displayName ?? model?.display_name ?? model?.displayModelName ?? model?.modelName ?? model?.model_name ?? model?.name ?? model?.label ?? "").trim();
      const modelName = String(model?.displayName ?? model?.display_name ?? model?.displayModelName ?? model?.modelName ?? model?.model_name ?? model?.name ?? model?.label ?? code).trim() || code;
      const schema = model?.parameterSchema && typeof model.parameterSchema === "object" && !Array.isArray(model.parameterSchema)
        ? model.parameterSchema
        : {};
      const enumValues = (field) => Array.isArray(schema?.[field]?.options)
        ? schema[field].options.map(String).filter(Boolean)
        : [];
      const resolutions = (Array.isArray(model?.supportedResolutions) && model.supportedResolutions.length
        ? model.supportedResolutions
        : Array.isArray(model?.supportedQuality) && model.supportedQuality.length ? model.supportedQuality : enumValues("resolution"));
      const ratios = Array.isArray(model?.supportedRatios) && model.supportedRatios.length ? model.supportedRatios : enumValues("aspectRatio");
      const durations = Array.isArray(model?.supportedDurations) && model.supportedDurations.length ? model.supportedDurations : enumValues("durationSec");
      const defaults = model?.defaultParams && typeof model.defaultParams === "object" && !Array.isArray(model.defaultParams) ? model.defaultParams : {};
      return {
        id: `comic-ai/${category}/${code}`,
        name: ["文本", "图片", "视频", "音频", "模型"].includes(modelLabel) ? modelName : (modelLabel || modelName),
        modelId: code,
        category: ["image", "video", "audio", "text"].includes(category) ? category : "text",
        providerConfigId: backendProviderId,
        executionProfile: category === "image" || category === "video"
          ? createBackendMediaExecutionProfile(category)
          : undefined,
        inputModalities: Array.isArray(model?.inputModalities) ? model.inputModalities : undefined,
        capabilities: model?.capabilities && typeof model.capabilities === "object" ? sanitizeCatalogValue(model.capabilities) : {},
        supportedRatios: Array.isArray(model?.supportedRatios) ? model.supportedRatios.map(String).filter(Boolean) : undefined,
        supportedQuality: Array.isArray(model?.supportedQuality) ? model.supportedQuality.map(String).filter(Boolean) : undefined,
        supportedResolutions: Array.isArray(model?.supportedResolutions) ? model.supportedResolutions.map(String).filter(Boolean) : undefined,
        supportedDurations: Array.isArray(model?.supportedDurations) ? model.supportedDurations.map(String).filter(Boolean) : undefined,
        parameterSchema: model?.parameterSchema && typeof model.parameterSchema === "object" ? sanitizeCatalogValue(model.parameterSchema) : undefined,
        defaultParams: model?.defaultParams && typeof model.defaultParams === "object" ? sanitizeCatalogValue(model.defaultParams) : undefined,
        videoCapability: category === "video" && (resolutions.length || ratios.length || durations.length) ? {
          resolutions: resolutions.map(String).filter(Boolean),
          ratios: ratios.map(String).filter(Boolean),
          durations: durations.map(Number).filter(Number.isFinite),
          ...(defaults.resolution != null || defaults.quality != null ? { defaultResolution: String(defaults.resolution ?? defaults.quality) } : {}),
          ...(defaults.aspectRatio != null || defaults.ratio != null ? { defaultRatio: String(defaults.aspectRatio ?? defaults.ratio) } : {}),
          ...(defaults.durationSec != null ? { defaultDuration: Number(defaults.durationSec) } : {}),
        } : undefined,
        pricing: sanitizeCatalogValue(resolveAiCanvasRuntimeModelPricing(model)),
        source: "comic-ai-backend",
      };
    })
    .filter(Boolean);
  const normalizeSkills = (skills) => (Array.isArray(skills) ? skills : [])
    .map((skill) => {
      const id = String(skill?.id ?? skill?.skillId ?? "").trim();
      if (!id) return null;
      return {
        id,
        name: String(skill?.name ?? skill?.title ?? skill?.displayName ?? skill?.display_name ?? skill?.skillName ?? "未命名 Skill").trim() || "未命名 Skill",
        description: String(skill?.description ?? skill?.summary ?? "").trim(),
        summary: String(skill?.summary ?? skill?.description ?? "").trim(),
        category: String(skill?.category ?? "general").trim() || "general",
        source: String(skill?.source ?? (skill?.ownerUserId ? "mine" : "official")).trim() || "official",
        version: String(skill?.version ?? "").trim() || undefined,
        content: typeof skill?.content === "string" ? skill.content : "",
      };
    })
    .filter(Boolean);
  let modelCatalog = normalizeModels(context.modelCatalog ?? context.models);
  let skillCatalog = normalizeSkills(context.skillCatalog ?? context.skills);
  let applying = false;
  const apply = () => {
    if (applying) return;
    applying = true;
    const state = store.getState();
    const existingModels = Array.isArray(state?.config?.generalModels)
      ? state.config.generalModels
        .filter((model) => model?.source !== "comic-ai-backend")
        .map((model) => ({
          ...model,
          ...(model?.executionProfile
            ? { executionProfile: normalizeExecutionProfile(model.executionProfile) }
            : {}),
        }))
      : [];
    const providers = { ...(state?.config?.providers ?? {}) };
    const defaultTextModelId = modelCatalog.find((model) => model.category === "text")?.id;
    if (modelCatalog.length && backendBaseUrl) {
      providers[backendProviderId] = { name: "Comic AI 后端", protocol: "backend", baseUrl: backendBaseUrl };
    }
    try {
      store.setState({
        config: {
          ...(state?.config ?? {}),
          providers,
          generalModels: [...modelCatalog, ...existingModels],
          // Chat rendering can show the first model before a persisted
          // assistant selection exists; execution requires that selection.
          ...(!state?.config?.assistantModelId && defaultTextModelId
            ? { assistantModelId: `general/${defaultTextModelId}` }
            : {}),
        },
        userSkills: skillCatalog,
      });
    } finally {
      applying = false;
    }
  };
  apply();
  const unsubscribe = store.subscribe?.((nextState, previousState) => {
    if (applying || nextState?.config === previousState?.config) return;
    queueMicrotask(apply);
  });
  return {
    update(next = {}) {
      if (next.modelCatalog !== undefined || next.models !== undefined) modelCatalog = normalizeModels(next.modelCatalog ?? next.models);
      if (next.skillCatalog !== undefined || next.skills !== undefined) skillCatalog = normalizeSkills(next.skillCatalog ?? next.skills);
      if (next.modelCatalog !== undefined || next.models !== undefined || next.skillCatalog !== undefined || next.skills !== undefined) apply();
    },
    dispose() {
      unsubscribe?.();
      if (originalConfig) store.setState({ config: originalConfig, userSkills: originalSkills });
    },
  };
}

function createAiCanvasRuntimeScaleBridge(surface, options = {}) {
  if (options.lightDom === true) {
    return { dispose() {} };
  }
  const rootNode = surface?.getRootNode?.();
  const host = rootNode?.host instanceof HTMLElement ? rootNode.host : surface;
  const inheritedZoom = Number.parseFloat(getComputedStyle(document.body).zoom);
  if (!(host instanceof HTMLElement) || !Number.isFinite(inheritedZoom) || inheritedZoom <= 0 || inheritedZoom === 1) {
    return { dispose() {} };
  }
  const previousZoom = host.style.zoom;
  const previousWidth = host.style.width;
  const previousHeight = host.style.height;
  host.style.zoom = String(1 / inheritedZoom);
  host.style.width = `${inheritedZoom * 100}%`;
  host.style.height = `${inheritedZoom * 100}%`;
  return {
    dispose() {
      host.style.zoom = previousZoom;
      host.style.width = previousWidth;
      host.style.height = previousHeight;
    },
  };
}

function normalizeAiCanvasRuntimeProject(project) {
  const id = String(project?.id ?? project?.projectId ?? "").trim();
  if (!id) return null;
  const name = String(project?.name ?? project?.title ?? "画布项目").trim() || "画布项目";
  const normalizeDate = (value, fallback) => {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    const parsed = Date.parse(String(value ?? ""));
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const createdAt = normalizeDate(project?.createdAt, Date.now());
  const updatedAt = normalizeDate(project?.updatedAt, createdAt);
  const parentId = String(project?.parentId ?? "").trim();
  const episodeNo = Number(project?.episodeNo);
  return {
    id,
    name,
    title: name,
    createdAt,
    updatedAt,
    status: String(project?.status ?? "草稿"),
    externalCanvasProject: true,
    ...(parentId ? { parentId } : {}),
    ...(Number.isFinite(episodeNo) && episodeNo > 0 ? { episodeNo } : {}),
    ...(project?.episodeOutline != null ? { episodeOutline: String(project.episodeOutline) } : {}),
    ...(project?.episodeScript != null ? { episodeScript: String(project.episodeScript) } : {}),
    ...(project?.episodeCreative && typeof project.episodeCreative === "object"
      ? { episodeCreative: project.episodeCreative }
      : {}),
    ...(project?.series && typeof project.series === "object" ? { series: project.series } : {}),
    ...(project?.settings && typeof project.settings === "object" ? { settings: project.settings } : {}),
  };
}

function normalizeAiCanvasRuntimeProjects(projects) {
  return (Array.isArray(projects) ? projects : [])
    .map(normalizeAiCanvasRuntimeProject)
    .filter(Boolean);
}

function mergeAiCanvasRuntimeProjects(catalogProjects, existingProjects) {
  const catalog = Array.isArray(catalogProjects) ? catalogProjects : [];
  const existing = Array.isArray(existingProjects) ? existingProjects : [];
  const existingById = new Map(existing.map((project) => [project?.id, project]));
  const catalogIds = new Set();
  const merged = catalog.map((project) => {
    const id = String(project?.id ?? "").trim();
    if (id) catalogIds.add(id);
    const previous = existingById.get(id);
    if (!previous) return project;
    return {
      ...previous,
      ...project,
      ...(previous.series || project.series ? { series: project.series ?? previous.series } : {}),
      ...(previous.parentId || project.parentId ? { parentId: project.parentId ?? previous.parentId } : {}),
      ...(previous.episodeNo != null || project.episodeNo != null
        ? { episodeNo: project.episodeNo ?? previous.episodeNo }
        : {}),
      ...(previous.episodeOutline != null || project.episodeOutline != null
        ? { episodeOutline: project.episodeOutline ?? previous.episodeOutline }
        : {}),
      ...(previous.episodeScript != null || project.episodeScript != null
        ? { episodeScript: project.episodeScript ?? previous.episodeScript }
        : {}),
      ...(previous.episodeCreative || project.episodeCreative
        ? { episodeCreative: project.episodeCreative ?? previous.episodeCreative }
        : {}),
      ...(previous.settings || project.settings
        ? { settings: project.settings ?? previous.settings }
        : {}),
    };
  });
  for (const project of existing) {
    const id = String(project?.id ?? "").trim();
    if (id && project.parentId && !catalogIds.has(id)) merged.push(project);
  }
  return merged;
}

function isAiCanvasRuntimeNativeHost() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function addAiCanvasRuntimeEpisodes(store, episodes = []) {
  const items = Array.isArray(episodes) ? episodes : [];
  const state = store?.getState?.() ?? {};
  const currentProjectId = String(state.currentProjectId ?? "").trim();
  if (!store?.setState || !currentProjectId || items.length === 0) return [];
  if (state.projectLoadStatus !== "ready") {
    state.showToast?.("项目尚未成功加载，已阻止新增分集", "error");
    return [];
  }
  const projects = Array.isArray(state.projects) ? state.projects : [];
  const current = projects.find((project) => project?.id === currentProjectId);
  if (!current) return [];
  const seriesId = String(current.parentId ?? currentProjectId).trim();
  const series = projects.find((project) => project?.id === seriesId) ?? current;
  let episodeNo = projects
    .filter((project) => project?.parentId === seriesId)
    .reduce((max, project) => Math.max(max, Number(project?.episodeNo ?? 0) || 0), 0);
  const created = items.map((item) => {
    episodeNo += 1;
    const now = Date.now();
    const name = String(item?.name ?? item?.title ?? "").trim() || `第 ${episodeNo} 集`;
    const outline = String(item?.outline ?? "").trim();
    return {
      id: globalThis.crypto?.randomUUID?.() ?? `episode-${now}-${episodeNo}`,
      name,
      createdAt: now,
      updatedAt: now,
      parentId: seriesId,
      episodeNo,
      ...(outline ? { episodeOutline: outline } : {}),
      ...(series?.settings ? { settings: series.settings } : {}),
    };
  });
  store.setState({ projects: [...projects, ...created] });
  return created.map((project) => project.id);
}

const AI_CANVAS_RUNTIME_NATIVE_NODE_TYPES = new Set([
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
  "canvas-note",
  "comment",
  "group",
  "plugin-node",
]);

function inferAiCanvasRuntimeNodeType(node) {
  const type = String(node?.type ?? node?.data?.type ?? "").trim();
  if (AI_CANVAS_RUNTIME_NATIVE_NODE_TYPES.has(type)) return type;
  const mediaKind = String(node?.data?.mediaKind ?? node?.data?.kind ?? "").trim().toLowerCase();
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
  if (type === "upload") {
    if (mediaKind === "video") return "source-video";
    if (mediaKind === "audio") return "source-audio";
    if (mediaKind === "text") return "source-text";
    return "source-image";
  }
  if (type === "output") {
    if (mediaKind === "video") return "ai-video";
    if (mediaKind === "audio") return "ai-audio";
    if (mediaKind === "text") return "ai-text";
    return "ai-image";
  }
  if (type === "markdown") return "ai-markdown";
  if (type === "director") return "ai-director";
  return type || "ai-text";
}

function normalizeAiCanvasRuntimeNode(node, index = 0, options = {}) {
  if (!node || typeof node !== "object") return null;
  const type = inferAiCanvasRuntimeNodeType(node);
  const data = node.data && typeof node.data === "object" ? { ...node.data } : {};
  const size = node.size && typeof node.size === "object" ? node.size : {};
  const label = String(data.label ?? data.title ?? node.title ?? "").trim()
    || (type === "comment" ? "备注" : "生成节点");
  const rawStatus = String(data.status ?? "").trim().toLowerCase();
  const mediaUrl = String(data.imageUrl ?? data.videoUrl ?? data.previewUrl ?? data.resultUrl ?? data.url ?? "").trim();
  const generating = ["loading", "running", "queued", "processing", "pending", "submitted"].includes(rawStatus);
  const staleGenerating = options.recoverStaleGenerating === true
    && generating
    && !String(data.taskId ?? data.lastTaskId ?? data.generationTaskId ?? "").trim();
  const status = staleGenerating
    ? (mediaUrl ? "success" : "idle")
    : generating
    ? "loading"
    : rawStatus === "ready" || rawStatus === "empty"
      ? "idle"
      : rawStatus === "completed" || rawStatus === "succeeded"
        ? "success"
        : data.status ?? "idle";
  const nextData = {
    ...data,
    label,
    type,
    status,
    ...(type === "source-text" ? { output: String(data.output ?? data.text ?? data.prompt ?? "") } : {}),
    ...(type !== "source-text" && data.prompt === undefined && data.text !== undefined ? { prompt: String(data.text ?? "") } : {}),
    ...(data.output === undefined && data.resultText !== undefined ? { output: data.resultText } : {}),
    ...(data.model === undefined && data.modelCode !== undefined ? { model: data.modelCode } : {}),
    ...(data.imageUrl === undefined && (data.url !== undefined || data.previewUrl !== undefined || data.resultUrl !== undefined)
      && (type === "ai-image" || type === "source-image" || type === "ai-panorama")
      ? { imageUrl: data.url ?? data.previewUrl ?? data.resultUrl }
      : {}),
    ...(data.videoUrl === undefined && (data.url !== undefined || data.previewUrl !== undefined || data.resultUrl !== undefined || data.resultVideoUrl !== undefined)
      && (type === "ai-video" || type === "source-video")
      ? { videoUrl: data.url ?? data.previewUrl ?? data.resultUrl ?? data.resultVideoUrl }
      : {}),
    ...(data.audioUrl === undefined && (data.url !== undefined || data.previewUrl !== undefined || data.resultUrl !== undefined)
      && (type === "ai-audio" || type === "source-audio")
      ? { audioUrl: data.url ?? data.previewUrl ?? data.resultUrl }
      : {}),
    ...(data.nodeWidth === undefined && Number.isFinite(Number(size.width)) ? { nodeWidth: Number(size.width) } : {}),
    ...(data.nodeHeight === undefined && Number.isFinite(Number(size.height)) ? { nodeHeight: Number(size.height) } : {}),
  };
  delete nextData.ports;
  if (!nextData.role && type.startsWith("source-")) nextData.role = "source";
  if (!nextData.role && type.startsWith("ai-")) nextData.role = "generator";
  return {
    ...node,
    id: String(node.id ?? `node-${index + 1}`),
    type,
    position: node.position && typeof node.position === "object"
      ? { x: Number(node.position.x ?? 0), y: Number(node.position.y ?? 0) }
      : { x: Number(node.x ?? 0), y: Number(node.y ?? 0) },
    data: nextData,
  };
}

function normalizeAiCanvasRuntimeEdge(edge, index = 0) {
  if (!edge || typeof edge !== "object") return null;
  const source = String(edge.source ?? edge.sourceNodeId ?? "").trim();
  const target = String(edge.target ?? edge.targetNodeId ?? "").trim();
  if (!source || !target) return null;
  return {
    ...edge,
    id: String(edge.id ?? `edge-${index + 1}`),
    source,
    target,
    ...(edge.sourceHandle !== undefined ? {} : edge.sourcePortId !== undefined ? { sourceHandle: edge.sourcePortId } : {}),
    ...(edge.targetHandle !== undefined ? {} : edge.targetPortId !== undefined ? { targetHandle: edge.targetPortId } : {}),
  };
}

function normalizeAiCanvasRuntimeDocument(document, canvasProjectId = "", options = {}) {
  const source = document && typeof document === "object" ? document : {};
  const nodes = (Array.isArray(source.nodes) ? source.nodes : [])
    .map((node, index) => normalizeAiCanvasRuntimeNode(node, index, options))
    .filter(Boolean);
  const grouping = normalizeAiCanvasRuntimeGrouping(nodes, source.groups);
  const nodeIds = new Set(grouping.nodes.map((node) => String(node?.id ?? "")).filter(Boolean));
  return {
    ...source,
    version: Number(source.version ?? 1) || 1,
    ...(canvasProjectId ? { canvasProjectId } : source.canvasProjectId ? { canvasProjectId: source.canvasProjectId } : {}),
    nodes: grouping.nodes,
    edges: (Array.isArray(source.edges) ? source.edges : [])
      .map(normalizeAiCanvasRuntimeEdge)
      .filter((edge) => edge && nodeIds.has(edge.source) && nodeIds.has(edge.target))
      .filter(Boolean),
    groups: grouping.groups,
  };
}

function createAiCanvasRuntimeHostProjectGuard(store, context = {}) {
  if (!store?.getState || !store?.setState) {
    return { update() {}, dispose() {} };
  }
  let projectCatalog = normalizeAiCanvasRuntimeProjects(context.projectCatalog);
  let currentProjectId = String(context.currentProjectId ?? context.canvasProjectId ?? "").trim();
  let hasDocument = context.document !== undefined || context.canvasDocument !== undefined;
  let document = hasDocument
    ? normalizeAiCanvasRuntimeDocument(
        context.document ?? context.canvasDocument,
        currentProjectId,
        { recoverStaleGenerating: true },
      )
    : null;
  const originalState = store.getState();
  const originalMethods = new Map();
  const methodNames = [
    "initFromDb",
    "loadProject",
    "migrateHistoryAndLoad",
    "saveCurrentProject",
    "saveCurrentProjectSilent",
    "captureCurrentProjectSnapshot",
  ];
  for (const name of methodNames) {
    if (typeof originalState?.[name] === "function") {
      originalMethods.set(name, originalState[name]);
    }
  }
  const cloneValue = (value) => {
    if (value == null) return value;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  };
  const omitRuntimeEphemeralNodeFields = (node, options = {}) => {
    if (!node || typeof node !== "object") return node;
    const {
      selected: _selected,
      dragging: _dragging,
      resizing: _resizing,
      measured: _measured,
      positionAbsolute: _positionAbsolute,
      width: _width,
      height: _height,
      internals: _internals,
      ...rest
    } = node;
    if (options.ignoreLayout !== true) return rest;
    const {
      style: _style,
      className: _className,
      size: _size,
      zIndex: _zIndex,
      position,
      ...content
    } = rest;
    return {
      ...content,
      ...(position && typeof position === "object"
        ? {
            position: {
              x: Math.round(Number(position.x ?? 0)),
              y: Math.round(Number(position.y ?? 0)),
            },
          }
        : {}),
    };
  };
  const omitRuntimeEphemeralEdgeFields = (edge, options = {}) => {
    if (!edge || typeof edge !== "object") return edge;
    const {
      selected: _selected,
      hidden: _hidden,
      sourceNodeId: _sourceNodeId,
      targetNodeId: _targetNodeId,
      sourcePortId: _sourcePortId,
      targetPortId: _targetPortId,
      ...rest
    } = edge;
    const normalized = {
      ...rest,
      id: String(edge.id ?? ""),
      source: String(edge.source ?? edge.sourceNodeId ?? ""),
      target: String(edge.target ?? edge.targetNodeId ?? ""),
      ...(edge.sourceHandle ?? edge.sourcePortId
        ? { sourceHandle: edge.sourceHandle ?? edge.sourcePortId }
        : {}),
      ...(edge.targetHandle ?? edge.targetPortId
        ? { targetHandle: edge.targetHandle ?? edge.targetPortId }
        : {}),
    };
    if (options.ignoreLayout !== true) return normalized;
    const { style: _style, className: _className, ...content } = normalized;
    return content;
  };
  const persistableCanvasRuntimeDocument = (value, options = {}) => {
    const source = value && typeof value === "object" ? value : {};
    const { updatedAt: _updatedAt, createdAt: _createdAt, viewport: _viewport, ...envelope } = source;
    return cloneValue({
      ...envelope,
      version: Number(source.version ?? 1) || 1,
      nodes: (Array.isArray(source.nodes) ? source.nodes : []).map((node) => omitRuntimeEphemeralNodeFields(node, options)),
      edges: (Array.isArray(source.edges) ? source.edges : []).map((edge) => omitRuntimeEphemeralEdgeFields(edge, options)),
      groups: Array.isArray(source.groups) ? source.groups : [],
    });
  };
  const arePersistableCanvasRuntimeDocumentsEqual = (left, right, options = {}) => {
    try {
      const stableJson = (value) => JSON.stringify(
        persistableCanvasRuntimeDocument(value, options),
        (_key, nestedValue) => {
          if (!nestedValue || Array.isArray(nestedValue) || typeof nestedValue !== "object") return nestedValue;
          return Object.keys(nestedValue).sort().reduce((sorted, key) => {
            sorted[key] = nestedValue[key];
            return sorted;
          }, Object.create(null));
        },
      );
      return stableJson(left) === stableJson(right);
    } catch {
      return false;
    }
  };
  let saveEnabled = false;
  const originalOnDocumentChange = context.onDocumentChange;
  context.onDocumentChange = (nextDocument, metadata = {}) => {
    if (arePersistableCanvasRuntimeDocumentsEqual(document, nextDocument)) {
      return undefined;
    }
    document = persistableCanvasRuntimeDocument(nextDocument);
    return originalOnDocumentChange?.(nextDocument, metadata);
  };
  const readRuntimeDocument = () => {
    const state = store.getState();
    const source = document && typeof document === "object" ? document : {};
    const { updatedAt: _updatedAt, ...envelope } = source;
    return persistableCanvasRuntimeDocument({
      ...envelope,
      version: Number(source.version ?? 1) || 1,
      ...(currentProjectId ? { canvasProjectId: currentProjectId } : {}),
      nodes: state.nodes ?? [],
      edges: state.edges ?? [],
      groups: state.groups ?? source.groups ?? [],
    });
  };
  const applyHostProjectState = (next = {}) => {
    const documentProvided = next.document !== undefined || next.canvasDocument !== undefined;
    if (next.projectCatalog !== undefined) {
      projectCatalog = normalizeAiCanvasRuntimeProjects(next.projectCatalog);
    }
    if (next.currentProjectId !== undefined) {
      currentProjectId = String(next.currentProjectId ?? "").trim();
    }
    if (documentProvided) {
      hasDocument = true;
      document = normalizeAiCanvasRuntimeDocument(
        next.document ?? next.canvasDocument,
        currentProjectId,
      );
    }
    const projects = mergeAiCanvasRuntimeProjects(projectCatalog, store.getState()?.projects);
    const currentProject = projects.find((project) => project.id === currentProjectId) ?? projects[0] ?? null;
    const patch = {
      ...(projects.length ? { projects } : {}),
      currentProjectId: currentProject?.id ?? currentProjectId ?? null,
      projectName: currentProject?.name ?? "",
      ...(documentProvided && !saveEnabled ? { projectLoadStatus: "loading" } : {}),
    };
    if (documentProvided) {
      patch.nodes = Array.isArray(document.nodes) ? cloneValue(document.nodes) : [];
      patch.edges = Array.isArray(document.edges) ? cloneValue(document.edges) : [];
      patch.groups = Array.isArray(document.groups) ? cloneValue(document.groups) : [];
    }
    store.setState(patch);
    if (documentProvided) {
      document = readRuntimeDocument();
    }
  };
  const loadedNodeCount = Array.isArray(document?.nodes) ? document.nodes.length : 0;
  const saveThroughHost = async () => {
    if (!saveEnabled) {
      return store.getState()?.currentProjectId ?? currentProjectId ?? undefined;
    }
    const nextDocument = readRuntimeDocument();
    const hostNodeCount = Array.isArray(document?.nodes) ? document.nodes.length : loadedNodeCount;
    const nextNodeCount = Array.isArray(nextDocument?.nodes) ? nextDocument.nodes.length : 0;
    if ((hostNodeCount > 0 || loadedNodeCount > 0) && nextNodeCount === 0) {
      console.warn("[creator-app] blocked empty canvas overwrite");
      return store.getState()?.currentProjectId ?? currentProjectId ?? undefined;
    }
    if (arePersistableCanvasRuntimeDocumentsEqual(document, nextDocument)) {
      return store.getState()?.currentProjectId ?? currentProjectId ?? undefined;
    }
    document = nextDocument;
    if (typeof context.onDocumentChange === "function") {
      await context.onDocumentChange(nextDocument, { scheduleSave: true });
    }
    return store.getState()?.currentProjectId ?? currentProjectId ?? undefined;
  };
  store.setState({
    initFromDb: async () => applyHostProjectState({ document }),
    loadProject: async () => applyHostProjectState({ document }),
    migrateHistoryAndLoad: async () => undefined,
    saveCurrentProject: saveThroughHost,
    saveCurrentProjectSilent: saveThroughHost,
    captureCurrentProjectSnapshot: async () => undefined,
  });
  applyHostProjectState({ document });
  return {
    enableSaves() {
      saveEnabled = true;
      store.setState({ projectLoadStatus: "ready" });
    },
    update(next = {}) {
      if (next.projectCatalog !== undefined || next.currentProjectId !== undefined || next.document !== undefined || next.canvasDocument !== undefined) {
        applyHostProjectState(next);
      }
    },
    dispose() {
      if (originalMethods.size) store.setState(Object.fromEntries(originalMethods));
    },
  };
}

async function createAiCanvasRuntimeProjectBridge(context = {}) {
  let projectCatalog = normalizeAiCanvasRuntimeProjects(context.projectCatalog);
  let currentProjectId = String(context.currentProjectId ?? "").trim();
  try {
    // Some lazily loaded runtime chunks read process.env during evaluation.
    // Browser hosts do not provide Node's process global, so initialize the
    // compatibility shim before the first runtime import (the mount path is
    // reached later and cannot protect this bridge import).
    globalThis.process ??= { env: { NODE_ENV: "production" } };
    aiCanvasRuntimeStorePromise ??= aiCanvasRuntimePromise ?? import("/ai-canvas-runtime/runtime.js");
    const storeModule = await aiCanvasRuntimeStorePromise;
    const store = storeModule?.useAppStore ?? storeModule?.t;
    if (!store?.getState || !store?.setState) {
      throw new Error("ai_canvas_runtime_store_unavailable");
    }
    const originalActions = new Map();
    const addedActions = new Set();
    const actionHandlers = {
      switchProject: typeof context.onSwitchProject === "function"
        ? async (projectId, ...args) => {
          const targetId = String(projectId ?? "").trim();
          const result = await context.onSwitchProject(projectId, ...args);
          if (result !== false && targetId) currentProjectId = targetId;
          return result;
        }
        : undefined,
      createProject: context.onCreateProject,
      renameProject: context.onRenameProject,
      setProjectName: typeof context.onRenameProject === "function"
        ? (name) => {
          const targetName = String(name ?? "").trim();
          if (!currentProjectId || !targetName) return false;
          return context.onRenameProject(currentProjectId, targetName);
        }
        : undefined,
      deleteProject: context.onDeleteProject,
      duplicateProject: context.onDuplicateProject,
      exportProject: context.onExportProject,
      importProject: context.onImportProject,
      openHome: context.onOpenHome,
      openProjects: context.onOpenProjects,
      addEpisodes: isAiCanvasRuntimeNativeHost()
        ? undefined
        : (episodes) => (typeof context.onAddEpisodes === "function"
          ? context.onAddEpisodes(episodes)
          : addAiCanvasRuntimeEpisodes(store, episodes)),
    };
    const applyCatalog = (next = {}) => {
      if (next.projectCatalog !== undefined) {
        projectCatalog = normalizeAiCanvasRuntimeProjects(next.projectCatalog);
      }
      if (next.currentProjectId !== undefined) {
        currentProjectId = String(next.currentProjectId ?? "").trim();
      }
      const state = store.getState();
      const existingProjects = Array.isArray(state.projects) ? state.projects : [];
      const projects = mergeAiCanvasRuntimeProjects(projectCatalog, existingProjects);
      const currentProject = projects.find((project) => project.id === currentProjectId) ?? projects[0];
      const resolvedCurrentProjectId = currentProject?.id ?? currentProjectId ?? state.currentProjectId ?? null;
      const patch = {
        projects,
        currentProjectId: resolvedCurrentProjectId,
        projectName: currentProject?.name ?? state.projectName ?? "",
        switchingProjectName: null,
      };
      if (
        state.currentProjectId === patch.currentProjectId
        && state.projectName === patch.projectName
        && state.switchingProjectName === null
        && Array.isArray(state.projects)
        && state.projects.length === projects.length
        && state.projects.every((project, index) => project.id === projects[index].id && project.name === projects[index].name)
      ) {
        return;
      }
      store.setState(patch);
    };
    applyCatalog({
      projectCatalog,
      currentProjectId,
      document: context.document,
    });
    const originalState = store.getState();
    for (const [name, handler] of Object.entries(actionHandlers)) {
      if (typeof handler !== "function") continue;
      if (typeof originalState[name] === "function") originalActions.set(name, originalState[name]);
      else addedActions.add(name);
      store.setState({
        [name]: async (...args) => handler(...args),
      });
    }
    let applying = false;
    const unsubscribe = store.subscribe((nextState, previousState) => {
      if (applying || !nextState || nextState.projects === previousState?.projects) return;
      queueMicrotask(() => {
        if (applying) return;
        applying = true;
        try {
          applyCatalog({ projectCatalog, currentProjectId });
          if (typeof context.onProjectsChange === "function") {
            context.onProjectsChange(nextState.projects);
          }
        } finally {
          applying = false;
        }
      });
    });
    return {
      update(next = {}) {
        if (next.projectCatalog !== undefined || next.currentProjectId !== undefined || next.document !== undefined) {
          applyCatalog(next);
        }
      },
      dispose() {
        unsubscribe?.();
        if (originalActions.size || addedActions.size) {
          const restored = Object.fromEntries(originalActions);
          for (const name of addedActions) restored[name] = undefined;
          store.setState(restored);
        }
      },
    };
  } catch (error) {
    console.warn("[creator-app] AI Canvas project bridge unavailable", error);
    return {
      update() {},
      dispose() {},
    };
  }
}

function resolveAiCanvasRuntimeConversationProjectId(projects, projectId) {
  const id = String(projectId ?? "").trim();
  if (!id) return "";
  const parentId = Array.isArray(projects)
    ? projects.find((project) => project?.id === id)?.parentId
    : undefined;
  return String(parentId ?? id).trim();
}

function isVisibleAiCanvasRuntimeConversation(conversation) {
  return !!conversation && conversation.archived !== true && conversation.deletedAt == null;
}

const AI_CANVAS_CHAT_OPEN_STORAGE_KEY = "ai-canvas.chat.open";

function shouldOpenAiCanvasRuntimeAssistant() {
  try {
    return localStorage.getItem(AI_CANVAS_CHAT_OPEN_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

function persistAiCanvasRuntimeAssistantOpen(open) {
  try {
    localStorage.setItem(AI_CANVAS_CHAT_OPEN_STORAGE_KEY, open ? "true" : "false");
  } catch {}
}

function openAiCanvasRuntimeAssistant(runtimeStore) {
  if (!shouldOpenAiCanvasRuntimeAssistant()) return;
  const state = runtimeStore?.getState?.();
  state?.setChatPanelDetached?.(false);
  state?.openChat?.();
}

function escapeAiCanvasHeaderText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function installAiCanvasRuntimeHeaderChrome(surface, runtimeStore, context = {}) {
  const root = surface?.querySelector?.(".new-canvas-root") ?? surface;
  const doc = surface?.ownerDocument ?? globalThis.document;
  if (!root || !doc?.createElement) return () => {};

  let disposed = false;
  let openMenu = "";
  let actionProjectId = "";

  const closeMenus = () => {
    openMenu = "";
    actionProjectId = "";
    root.querySelectorAll?.("[data-host-header-menu]").forEach((node) => node.remove());
    root.querySelectorAll?.("[data-host-header-expanded]").forEach((node) => {
      node.removeAttribute("data-host-header-expanded");
      node.setAttribute("aria-expanded", "false");
      node.classList.remove("is-active");
    });
  };

  const currentState = () => runtimeStore?.getState?.() ?? {};
  const currentProjects = () => (Array.isArray(currentState().projects) ? currentState().projects : []);
  const currentProjectId = () => String(currentState().currentProjectId ?? context.currentProjectId ?? "").trim();

  const renderBrandMenu = (header) => {
    const menu = doc.createElement("div");
    menu.className = "app-brand-menu";
    menu.dataset.hostHeaderMenu = "brand";
    menu.setAttribute("role", "menu");
    const currentId = currentProjectId();
    menu.innerHTML = `
      <button type="button" role="menuitem" data-host-header-action="open-home">回到主页</button>
      <button type="button" role="menuitem" data-host-header-action="open-projects">全部项目</button>
      <button type="button" role="menuitem" data-host-header-action="create-project">创建新项目</button>
      ${currentId ? `<div></div><button type="button" role="menuitem" data-host-header-action="delete-project" data-project-id="${escapeAiCanvasHeaderText(currentId)}">删除项目</button>` : ""}
    `;
    const brand = header.querySelector("[data-host-header-brand]");
    if (brand) brand.after(menu);
    else header.append(menu);
  };

  const renderProjectMenu = (header) => {
    const projects = currentProjects();
    const currentId = currentProjectId();
    const creating = currentState().isCreatingProject === true;
    const menu = doc.createElement("div");
    menu.className = "app-canvas-project-menu";
    menu.dataset.hostHeaderMenu = "projects";
    menu.setAttribute("role", "menu");
    menu.innerHTML = `
      <div class="app-canvas-project-menu-title">
        <span>${creating ? "正在新建画布" : "画布"}</span>
        <button type="button" class="app-canvas-project-create" data-host-header-action="create-project" ${creating ? "disabled" : ""} aria-label="${creating ? "正在新建画布" : "新建画布"}">+</button>
      </div>
      <div class="app-canvas-project-list">
        ${projects.length ? projects.map((project) => {
          const id = String(project?.id ?? "");
          const name = String(project?.name ?? project?.title ?? "未命名画布");
          const current = id === currentId;
          return `<div class="app-canvas-project-row${current ? " is-current" : ""}">
            <button type="button" class="app-canvas-project-select" data-host-header-action="switch-project" data-project-id="${escapeAiCanvasHeaderText(id)}">
              <span>${escapeAiCanvasHeaderText(name)}</span>
              ${current ? `<span class="app-canvas-project-check">✓</span>` : ""}
            </button>
            <button type="button" class="app-canvas-project-more" data-host-header-action="toggle-project-actions" data-project-id="${escapeAiCanvasHeaderText(id)}" aria-label="画布操作">⋯</button>
          </div>`;
        }).join("") : `<div class="app-canvas-project-empty">暂无画布</div>`}
      </div>
    `;
    header.append(menu);
    if (actionProjectId) renderProjectActionsMenu(header, actionProjectId);
  };

  const renderProjectActionsMenu = (header, projectId) => {
    header.querySelector("[data-host-header-menu='actions']")?.remove();
    const menu = doc.createElement("div");
    menu.className = "app-canvas-project-actions-menu";
    menu.dataset.hostHeaderMenu = "actions";
    menu.setAttribute("role", "menu");
    menu.innerHTML = `
      <button type="button" class="app-canvas-project-action" data-host-header-action="rename-project" data-project-id="${escapeAiCanvasHeaderText(projectId)}">重命名画布</button>
      <button type="button" class="app-canvas-project-action" data-host-header-action="duplicate-project" data-project-id="${escapeAiCanvasHeaderText(projectId)}">复制画布</button>
      <button type="button" class="app-canvas-project-action is-danger" data-host-header-action="delete-project" data-project-id="${escapeAiCanvasHeaderText(projectId)}">删除画布</button>
    `;
    header.append(menu);
  };

  const bindHeader = (header) => {
    if (!header) return;
    const brand = header.querySelector(":scope > div:first-child");
    if (brand && !brand.dataset.hostHeaderBrand) {
      brand.dataset.hostHeaderBrand = "true";
      brand.classList.add("app-brand", "app-header-brand");
      brand.setAttribute("role", "button");
      brand.setAttribute("tabindex", "0");
      brand.setAttribute("aria-label", "画布菜单");
      brand.setAttribute("aria-expanded", "false");
      if (!brand.querySelector("[data-host-header-chevron]")) {
        const chevron = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
        chevron.setAttribute("viewBox", "0 0 24 24");
        chevron.setAttribute("width", "14");
        chevron.setAttribute("height", "14");
        chevron.setAttribute("aria-hidden", "true");
        chevron.dataset.hostHeaderChevron = "true";
        chevron.innerHTML = '<path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />';
        brand.append(chevron);
      }
    }
    if (!header.querySelector("[data-host-header-chrome]")) {
      const extras = doc.createElement("div");
      extras.dataset.hostHeaderChrome = "true";
      extras.innerHTML = `
        <button type="button" class="app-header-project-switch" data-host-header-trigger="projects" aria-label="切换项目" aria-expanded="false">
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
        <button type="button" class="app-header-help" data-host-header-trigger="help" aria-label="使用帮助">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 19V5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M13 3v4a2 2 0 0 0 2 2h4M8 13h8M8 17h5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
          使用帮助
        </button>
      `;
      const editable = header.querySelector("[contenteditable='true']");
      (editable ?? brand)?.after(extras);
    }
  };

  const refreshOpenMenus = () => {
    const header = root.querySelector?.(".app-header");
    if (!header) return;
    header.querySelectorAll("[data-host-header-menu]").forEach((node) => node.remove());
    if (openMenu === "brand") renderBrandMenu(header);
    if (openMenu === "projects") renderProjectMenu(header);
    header.querySelector("[data-host-header-brand]")?.setAttribute("aria-expanded", String(openMenu === "brand"));
    const projectTrigger = header.querySelector("[data-host-header-trigger='projects']");
    projectTrigger?.setAttribute("aria-expanded", String(openMenu === "projects"));
    if (openMenu === "projects") projectTrigger?.setAttribute("data-host-header-expanded", "true");
    const helpTrigger = header.querySelector("[data-host-header-trigger='help']");
    helpTrigger?.classList.toggle("is-active", currentState().helpOpen === true);
  };

  const onPointerDown = (event) => {
    const target = event.target?.closest?.("[data-host-header-action], [data-host-header-trigger], [data-host-header-brand], [data-host-header-menu]");
    if (!target) {
      closeMenus();
      return;
    }
    if (target.closest?.("[data-host-header-brand]")) {
      event.preventDefault();
      event.stopPropagation();
      openMenu = openMenu === "brand" ? "" : "brand";
      actionProjectId = "";
      refreshOpenMenus();
      return;
    }
    const trigger = target.dataset.hostHeaderTrigger || target.closest?.("[data-host-header-trigger]")?.dataset?.hostHeaderTrigger;
    if (trigger === "projects") {
      event.preventDefault();
      event.stopPropagation();
      openMenu = openMenu === "projects" ? "" : "projects";
      actionProjectId = "";
      refreshOpenMenus();
      return;
    }
    if (trigger === "help") {
      event.preventDefault();
      event.stopPropagation();
      closeMenus();
      currentState().setHelpOpen?.(true);
      return;
    }
    const actionNode = target.closest?.("[data-host-header-action]");
    const action = actionNode?.dataset?.hostHeaderAction;
    const projectId = String(actionNode?.dataset?.projectId ?? "").trim();
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    const state = currentState();
    if (action === "open-home") {
      closeMenus();
      void context.onOpenHome?.();
      return;
    }
    if (action === "open-projects") {
      closeMenus();
      void context.onOpenProjects?.();
      return;
    }
    if (action === "create-project") {
      closeMenus();
      void state.createProject?.();
      return;
    }
    if (action === "switch-project" && projectId) {
      closeMenus();
      void state.switchProject?.(projectId);
      return;
    }
    if (action === "toggle-project-actions" && projectId) {
      actionProjectId = actionProjectId === projectId ? "" : projectId;
      const header = root.querySelector?.(".app-header");
      if (header && openMenu === "projects") renderProjectActionsMenu(header, actionProjectId);
      if (!actionProjectId) header?.querySelector("[data-host-header-menu='actions']")?.remove();
      return;
    }
    if (action === "rename-project" && projectId) {
      const project = currentProjects().find((item) => item?.id === projectId);
      const nextName = globalThis.prompt?.("画布名称", project?.name ?? project?.title ?? "");
      closeMenus();
      if (nextName?.trim()) void state.renameProject?.(projectId, nextName.trim());
      return;
    }
    if (action === "duplicate-project" && projectId) {
      closeMenus();
      void state.duplicateProject?.(projectId);
      return;
    }
    if (action === "delete-project" && projectId) {
      closeMenus();
      if (globalThis.confirm?.("确定删除当前项目吗？")) void state.deleteProject?.(projectId);
    }
  };

  let syncing = false;
  const sync = () => {
    if (disposed || syncing) return;
    const header = root.querySelector?.(".app-header");
    if (!header) return;
    syncing = true;
    try {
      bindHeader(header);
    } finally {
      syncing = false;
    }
  };

  root.addEventListener("pointerdown", onPointerDown, true);
  const observer = typeof MutationObserver === "function"
    ? new MutationObserver(() => sync())
    : null;
  observer?.observe(root, { childList: true, subtree: true });
  const unsubscribe = runtimeStore?.subscribe?.(() => {
    if (disposed) return;
    sync();
    if (openMenu) refreshOpenMenus();
  });
  sync();
  return () => {
    disposed = true;
    observer?.disconnect?.();
    unsubscribe?.();
    root.removeEventListener("pointerdown", onPointerDown, true);
    closeMenus();
    root.querySelectorAll?.("[data-host-header-chrome]").forEach((node) => node.remove());
  };
}

function readAiCanvasRuntimePreferredModel(nodeType) {
  try {
    const prefs = JSON.parse(globalThis.localStorage?.getItem("canvas-model-prefs") || "null");
    if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) return "";
    const type = String(nodeType ?? "").trim();
    return String(prefs[type] ?? (type === "ai-panorama" ? prefs["ai-image"] : "") ?? "").trim();
  } catch {
    return "";
  }
}

function resolveAiCanvasRuntimeSelectedModel(runtimeStore, node = {}) {
  const state = runtimeStore?.getState?.() ?? {};
  const models = Array.isArray(state?.config?.generalModels) ? state.config.generalModels : [];
  const data = node?.data && typeof node.data === "object" ? node.data : {};
  const selectedValue = String(data.model ?? data.modelCode ?? data.modelId ?? "").trim()
    || readAiCanvasRuntimePreferredModel(node?.type ?? data?.type);
  return matchCanvasRuntimeCatalogModel(models, selectedValue)
    ?? matchCanvasRuntimeCatalogModel(models, data.modelId);
}

function installAiCanvasRuntimePromptCreditCost(surface, runtimeStore) {
  const root = surface?.querySelector?.(".new-canvas-root") ?? surface;
  const doc = surface?.ownerDocument ?? globalThis.document;
  if (!root || !doc?.createElement || typeof MutationObserver !== "function") return () => {};

  let disposed = false;
  let nesting = false;
  const sync = () => {
    if (disposed || nesting) return;
    const actions = root.querySelector?.(".prompt-footer .prompt-actions");
    const submit = actions?.querySelector?.(".prompt-submit-btn, .prompt-stop-btn");
    if (!actions || !submit) {
      root.querySelectorAll?.(".prompt-credit-cost").forEach((node) => node.remove());
      return;
    }
    const state = runtimeStore?.getState?.() ?? {};
    const nodeId = String(state.activeNodeId ?? "").trim();
    const node = (Array.isArray(state.nodes) ? state.nodes : []).find((item) => String(item?.id ?? "") === nodeId) ?? null;
    const selectedModel = resolveAiCanvasRuntimeSelectedModel(runtimeStore, node);
    const cost = resolveCanvasRuntimeNodeCreditCost(node, selectedModel);
    nesting = true;
    try {
      let label = actions.querySelector?.(".prompt-credit-cost");
      if (!Number.isFinite(Number(cost)) || Number(cost) <= 0) {
        label?.remove();
        return;
      }
      if (!label) {
        label = doc.createElement("span");
        label.className = "prompt-credit-cost";
        label.setAttribute("aria-label", "预计消耗积分");
        actions.insertBefore(label, submit.closest(".prompt-submit-wrap") ?? submit);
      }
      const nextText = `${Math.round(Number(cost))} 积分`;
      if (label.textContent !== nextText) label.textContent = nextText;
    } finally {
      nesting = false;
    }
  };

  const observer = new MutationObserver(() => sync());
  observer.observe(root, { childList: true, subtree: true });
  const unsubscribe = typeof runtimeStore?.subscribe === "function"
    ? runtimeStore.subscribe(() => sync())
    : () => {};
  sync();
  return () => {
    disposed = true;
    observer.disconnect();
    unsubscribe?.();
    root.querySelectorAll?.(".prompt-credit-cost").forEach((node) => node.remove());
  };
}

function installAiCanvasRuntimeFooterZoomControls(surface) {
  const root = surface?.querySelector?.(".new-canvas-root") ?? surface;
  if (!root || typeof MutationObserver !== "function") return () => {};

  let disposed = false;
  let nesting = false;
  const nest = () => {
    if (disposed || nesting) return;
    const toolbar = root.querySelector?.(".footer-toolbar");
    const controls = root.querySelector?.(".react-flow__controls.canvas-controls");
    if (!toolbar || !controls || controls.parentElement === toolbar) return;
    nesting = true;
    try {
      toolbar.append(controls);
    } finally {
      nesting = false;
    }
  };

  const observer = new MutationObserver(() => nest());
  observer.observe(root, { childList: true, subtree: true });
  nest();
  return () => {
    disposed = true;
    observer.disconnect();
  };
}

function subscribeAiCanvasRuntimeAssistantPreference(runtimeStore) {
  if (typeof runtimeStore?.subscribe !== "function") return () => {};
  let previousOpen = runtimeStore.getState?.()?.chatOpen;
  return runtimeStore.subscribe((nextState) => {
    const nextOpen = nextState?.chatOpen;
    if (nextOpen === previousOpen) return;
    previousOpen = nextOpen;
    persistAiCanvasRuntimeAssistantOpen(nextOpen !== false);
  });
}

async function ensureAiCanvasRuntimeDefaultConversation(runtimeStore, context = {}) {
  const initialState = runtimeStore?.getState?.();
  // New Canvas opens the embedded assistant by default, but preserves the
  // user's explicit close/open preference across page entries.
  // Clear a stale detached-window flag left by a previous runtime session.
  initialState?.setChatPanelDetached?.(false);
  openAiCanvasRuntimeAssistant(runtimeStore);

  const currentProjectId = String(
    initialState?.currentProjectId ?? context.currentProjectId ?? context.canvasProjectId ?? "",
  ).trim();
  if (!currentProjectId) return;

  try {
    await initialState?.loadConversationsForProject?.(currentProjectId);
  } catch (error) {
    console.warn("[creator-app] AI Canvas conversation load failed", error);
  }

  const state = runtimeStore?.getState?.() ?? initialState;
  const settledProjectId = String(state?.currentProjectId ?? currentProjectId).trim();
  if (!settledProjectId || settledProjectId !== currentProjectId) return;

  const normalizedProjectId = resolveAiCanvasRuntimeConversationProjectId(state?.projects, settledProjectId);
  const conversations = Array.isArray(state?.conversations) ? state.conversations : [];
  const belongsToCurrentProject = (conversation) => (
    isVisibleAiCanvasRuntimeConversation(conversation)
      && resolveAiCanvasRuntimeConversationProjectId(state?.projects, conversation?.projectId) === normalizedProjectId
  );
  const activeConversation = conversations.find((conversation) => conversation?.id === state?.activeConversationId);
  if (belongsToCurrentProject(activeConversation)) {
    openAiCanvasRuntimeAssistant(runtimeStore);
    return;
  }

  const firstProjectConversation = conversations.find(belongsToCurrentProject);
  if (firstProjectConversation?.id) {
    state?.setActiveConversation?.(firstProjectConversation.id);
    openAiCanvasRuntimeAssistant(runtimeStore);
    return;
  }

  state?.createConversation?.(settledProjectId);
  openAiCanvasRuntimeAssistant(runtimeStore);
}

function isAiCanvasAssistantTaskTerminal(task) {
  const status = String(task?.status ?? task?.workflowStatus ?? "").trim().toLowerCase();
  return [
    "completed",
    "succeeded",
    "failed",
    "canceled",
    "cancelled",
    "manual_review_required",
    "result_unknown",
  ].includes(status);
}

function readAiCanvasAssistantMediaCandidate(value) {
  return String(value ?? "").trim();
}

function resolveAiCanvasAssistantTaskMedia(task) {
  const result = task?.result && typeof task.result === "object" ? task.result : {};
  const items = [
    ...(Array.isArray(task?.generatedOutputItems) ? task.generatedOutputItems : []),
    ...(Array.isArray(result.generatedOutputItems) ? result.generatedOutputItems : []),
    ...(Array.isArray(task?.resultAssets) ? task.resultAssets : []),
    ...(Array.isArray(result.images) ? result.images : []),
    ...(Array.isArray(result.videos) ? result.videos : []),
    ...(Array.isArray(task?.fixedImages) ? task.fixedImages : []),
    ...(Array.isArray(task?.fixedVideos) ? task.fixedVideos : []),
  ];
  const itemUrl = items
    .flatMap((item) => [
      item?.url,
      item?.imageUrl,
      item?.videoUrl,
      item?.previewUrl,
      item?.sourceUrl,
      item?.downloadUrl,
      item?.src,
    ])
    .map(readAiCanvasAssistantMediaCandidate)
    .find(Boolean) ?? "";
  const videoUrl = [
    result.videoUrl,
    task?.videoUrl,
    task?.fixedVideos?.[0]?.url,
    itemUrl,
  ].map(readAiCanvasAssistantMediaCandidate).find(Boolean) ?? "";
  const imageUrl = [
    result.imageUrl,
    result.previewUrl,
    result.sourceUrl,
    result.downloadUrl,
    result.url,
    task?.imageUrl,
    task?.url,
    task?.fixedImages?.[0]?.url,
    itemUrl,
  ].map(readAiCanvasAssistantMediaCandidate).find(Boolean) ?? "";
  const kind = task?.kind === "video" || task?.mediaKind === "video" || videoUrl ? "video" : "image";
  return { kind, url: kind === "video" ? videoUrl || imageUrl : imageUrl || videoUrl };
}

function createAiCanvasAssistantTaskResponse(task) {
  const status = String(task?.status ?? task?.workflowStatus ?? "").trim().toLowerCase();
  const mappedStatus = status === "succeeded" ? "completed" : status === "cancelled" ? "canceled" : status;
  const media = resolveAiCanvasAssistantTaskMedia(task);
  const mediaKey = media.kind === "video" ? "videos" : "images";
  return new Response(JSON.stringify({
    requestId: `canvas-assistant-task-center-${Date.now().toString(36)}`,
    data: {
      status: mappedStatus || "failed",
      ...(media.url ? { result: { [mediaKey]: [{ url: media.url }] } } : {}),
      error: task?.failure?.displayMessage ?? task?.displayMessage ?? task?.error ?? undefined,
    },
  }), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function resolveAiCanvasRuntimeGeneratingNodeId(runtimeWindow, context = {}, taskId = "") {
  const store = context.runtimeStore;
  const nodes = Array.isArray(store?.getState?.()?.nodes) ? store.getState().nodes : [];
  const generating = nodes.filter((node) => {
    const status = String(node?.data?.status ?? "").trim().toLowerCase();
    return ["loading", "running", "queued", "processing", "pending", "submitted"].includes(status);
  });
  const wanted = String(taskId ?? "").trim();
  if (wanted) {
    const matched = generating.find((node) =>
      String(node?.data?.taskId ?? node?.data?.lastTaskId ?? node?.data?.generationTaskId ?? "").trim() === wanted
    );
    if (matched) return String(matched.id ?? "").trim();
  }
  const unbound = generating.filter((node) =>
    !String(node?.data?.taskId ?? node?.data?.lastTaskId ?? node?.data?.generationTaskId ?? "").trim()
  );
  const pick = (unbound.length ? unbound : generating).at(-1);
  return String(pick?.id ?? "").trim();
}

function installAiCanvasAssistantTaskCenterBridge(runtimeWindow, context = {}) {
  const fetchImpl = runtimeWindow?.fetch;
  const canUseTaskCenter = typeof context.onGenerationTaskCreated === "function"
    && (
      typeof context.api?.getGenerationTasks === "function"
      || typeof context.api?.getGenerationTask === "function"
      || typeof context.api?.listTaskCenterTasks === "function"
    );
  if (typeof fetchImpl !== "function" || fetchImpl.__comicAiTaskCenterBridge || !canUseTaskCenter) {
    return { dispose() {} };
  }
  const originalFetch = fetchImpl.bind(runtimeWindow);
  const waiters = new Map();
  const terminalTasks = new Map();
  const resolveRequestUrl = (input) => String(
    typeof input === "string" ? input : input?.url ?? "",
  );
  const resolveRequestMethod = (input, init) => String(
    init?.method ?? (typeof input !== "string" ? input?.method : "") ?? "GET",
  ).toUpperCase();
  const readJsonBody = async (input, init) => {
    const raw = init?.body;
    if (typeof raw === "string") {
      try { return JSON.parse(raw); } catch { return null; }
    }
    if (typeof Request !== "undefined" && input instanceof Request) {
      try { return await input.clone().json(); } catch { return null; }
    }
    return null;
  };
  const notifyWaiters = (task) => {
    const taskId = String(task?.taskId ?? task?.generationTaskId ?? task?.id ?? "").trim();
    if (!taskId || !isAiCanvasAssistantTaskTerminal(task)) return;
    const status = String(task?.status ?? task?.workflowStatus ?? "").trim().toLowerCase();
    const isSuccess = status === "completed" || status === "succeeded";
    if (isSuccess && !resolveAiCanvasAssistantTaskMedia(task).url) return;
    terminalTasks.set(taskId, task);
    const pending = waiters.get(taskId);
    if (!pending?.size) return;
    waiters.delete(taskId);
    const response = createAiCanvasAssistantTaskResponse(task);
    for (const waiter of pending) {
      try { waiter.resolve(response.clone()); } catch { waiter.reject?.(new Error("任务中心回写失败")); }
    }
  };
  globalThis.__COMIC_AI_NOTIFY_ASSISTANT_TASK_WAITERS__ = notifyWaiters;
  const waitForTaskCenter = (taskId, signal) => {
    const cached = terminalTasks.get(taskId);
    if (cached) return Promise.resolve(createAiCanvasAssistantTaskResponse(cached));
    return new Promise((resolve, reject) => {
      const pending = waiters.get(taskId) ?? new Set();
      const waiter = { resolve, reject };
      let timeoutId = 0;
      const onAbort = () => {
        cleanup();
        reject(signal?.reason ?? new DOMException("任务已被取消", "AbortError"));
      };
      const cleanup = () => {
        pending.delete(waiter);
        if (!pending.size) waiters.delete(taskId);
        signal?.removeEventListener?.("abort", onAbort);
        if (timeoutId) runtimeWindow.clearTimeout?.(timeoutId);
      };
      waiter.resolve = (response) => {
        cleanup();
        resolve(response);
      };
      waiter.reject = (error) => {
        cleanup();
        reject(error);
      };
      pending.add(waiter);
      waiters.set(taskId, pending);
      if (signal?.aborted) {
        onAbort();
        return;
      }
      signal?.addEventListener?.("abort", onAbort, { once: true });
      timeoutId = runtimeWindow.setTimeout?.(() => {
        waiter.reject(new Error("模型任务轮询超时"));
      }, 30 * 60 * 1_000) ?? 0;
    });
  };
  const bridgedFetch = async (input, init = {}) => {
    const url = resolveRequestUrl(input);
    const method = resolveRequestMethod(input, init);
    const generationsMatch = url.match(/\/api\/canvas\/[^/]+\/assistant\/(images|videos)\/generations(?:\?|$)/);
    const tasksMatch = url.match(/\/api\/canvas\/[^/]+\/assistant\/tasks\/([^/?]+)(?:\?|$)/);
    if (method === "POST" && generationsMatch) {
      const body = await readJsonBody(input, init);
      const response = await originalFetch(input, init);
      try {
        const payload = await response.clone().json();
        const taskId = String(payload?.data?.[0]?.task_id ?? payload?.[0]?.task_id ?? "").trim();
        if (taskId) {
          const mediaKind = generationsMatch[1] === "videos" ? "video" : "image";
          const nodeId = String(
            body?.canvasNodeId
              ?? body?.nodeKey
              ?? body?.nodeId
              ?? resolveAiCanvasRuntimeGeneratingNodeId(runtimeWindow, context)
              ?? "",
          ).trim();
          void Promise.resolve(context.onGenerationTaskCreated(taskId, {
            kind: mediaKind,
            mediaKind,
            targetType: nodeId ? "canvas_node" : "canvas",
            targetId: nodeId || context.currentProjectId || context.canvasProjectId,
            prompt: String(body?.prompt ?? ""),
            model: String(body?.model ?? ""),
          })).catch(() => undefined);
        }
      } catch {
        // Task-center registration is best-effort; the submit response still returns to runtime.
      }
      return response;
    }
    if (method === "GET" && tasksMatch) {
      const taskId = decodeURIComponent(tasksMatch[1]);
      const nodeId = resolveAiCanvasRuntimeGeneratingNodeId(runtimeWindow, context, taskId);
      void Promise.resolve(context.onGenerationTaskCreated?.(taskId, {
        ...(nodeId
          ? { targetType: "canvas_node", targetId: nodeId }
          : {}),
      })).catch(() => undefined);
      return waitForTaskCenter(taskId, init?.signal ?? input?.signal);
    }
    return originalFetch(input, init);
  };
  bridgedFetch.__comicAiTaskCenterBridge = true;
  runtimeWindow.fetch = bridgedFetch;
  return {
    dispose() {
      if (runtimeWindow.fetch === bridgedFetch) runtimeWindow.fetch = originalFetch;
      if (globalThis.__COMIC_AI_NOTIFY_ASSISTANT_TASK_WAITERS__ === notifyWaiters) {
        globalThis.__COMIC_AI_NOTIFY_ASSISTANT_TASK_WAITERS__ = undefined;
      }
      for (const pending of waiters.values()) {
        for (const waiter of pending) {
          try { waiter.reject(new DOMException("任务已被取消", "AbortError")); } catch {}
        }
      }
      waiters.clear();
    },
  };
}

function mountStandaloneAiCanvasRuntime(surface, context = {}) {
  globalThis.process ??= { env: { NODE_ENV: "production" } };
  aiCanvasRuntimePromise ??= import("/ai-canvas-runtime/runtime.js");
  return aiCanvasRuntimePromise.then((runtimeModule) => {
    const mountAiCanvasRuntime = runtimeModule?.mountAiCanvasRuntime;
    const runtimeStore = runtimeModule?.useAppStore ?? runtimeModule?.t;
    const rootNode = surface?.getRootNode?.();
    const isShadowRoot = typeof ShadowRoot !== "undefined" && rootNode instanceof ShadowRoot;
    const styleRoot = isShadowRoot ? rootNode : document.head;
    const globalStylesheet = acquireAiCanvasRuntimeGlobalStyle();
    const stylesheetHref = "/ai-canvas-runtime/assets/runtime-brand-overrides.css?v=20260912-20";
    if (styleRoot?.querySelector && !styleRoot.querySelector(`style[data-ai-canvas-runtime-layout="true"]`)) {
      const layoutStyle = document.createElement("style");
      layoutStyle.dataset.aiCanvasRuntimeLayout = "true";
      const isStandaloneHost = rootNode?.host?.classList?.contains?.("ai-canvas-standalone-mount");
      layoutStyle.textContent = isShadowRoot ? `
        :host {
          width: 100% !important;
          height: ${isStandaloneHost ? "100dvh" : "100%"} !important;
          min-height: ${isStandaloneHost ? "100dvh" : "0"} !important;
        }
        .new-canvas-root,
        .new-canvas-root > .app-shell {
          width: 100% !important;
          height: 100% !important;
          min-height: 0 !important;
        }
        .app-header {
          gap: 4px !important;
          padding: 10px !important;
          min-height: 72px !important;
          min-width: 440px !important;
          font-size: 16px !important;
        }
        .app-header button {
          min-width: 56px !important;
          min-height: 56px !important;
          font-size: 20px !important;
        }
        .app-header [contenteditable="true"] {
          min-width: 180px !important;
          max-width: 260px !important;
          font-size: 20px !important;
          line-height: 1.4 !important;
        }
        .app-header span {
          font-size: 20px !important;
          line-height: 1.4 !important;
        }
        .app-header img {
          width: 48px !important;
          height: 48px !important;
        }
        .new-canvas-root .sidebar-floating {
          top: 12px !important;
          left: auto !important;
          right: 12px !important;
          width: max-content !important;
          max-width: calc(100% - 24px) !important;
          height: auto !important;
          flex-direction: row !important;
          gap: 4px !important;
          padding: 7px !important;
          transform: none !important;
        }
        .new-canvas-root .sidebar-floating .sidebar-btn-v3 {
          width: 44px !important;
          height: 44px !important;
        }
        .new-canvas-root .sidebar-floating .sidebar-btn-v3 svg {
          width: 24px !important;
          height: 24px !important;
        }
        .new-canvas-root .sidebar-floating {
          transition: none !important;
        }
        .new-canvas-root .app-shell:has(.chat-panel) .sidebar-floating {
          right: calc(var(--chat-panel-width, 600px) + 24px) !important;
        }
        .sidebar-floating {
          top: 12px !important;
          left: auto !important;
          right: 12px !important;
          width: max-content !important;
          max-width: calc(100% - 24px) !important;
          height: auto !important;
          flex-direction: row !important;
          gap: 4px !important;
          padding: 7px !important;
          transform: none !important;
        }
        .sidebar-floating .sidebar-btn-v3 {
          width: 44px !important;
          height: 44px !important;
        }
        .sidebar-floating .sidebar-btn-v3 svg {
          width: 24px !important;
          height: 24px !important;
        }
        .new-canvas-root .sidebar-floating {
          transition: none !important;
        }
        .app-shell:has(.chat-panel) .sidebar-floating {
          right: calc(var(--chat-panel-width, 600px) + 24px) !important;
        }
        .new-canvas-root .model-selector {
          flex: 0 0 auto !important;
          width: 32px !important;
        }
        .new-canvas-root .model-selector-trigger {
          width: 32px !important;
          height: 32px !important;
          justify-content: center !important;
          padding: 0 !important;
        }
        .new-canvas-root .model-selector-label,
        .new-canvas-root .model-selector-trigger .caret {
          display: none !important;
        }
        .new-canvas-root .footer-toolbar {
          gap: 8px !important;
          padding: 6px 8px !important;
        }
        .new-canvas-root .footer-toolbar button {
          width: 40px !important;
          height: 40px !important;
        }
        .new-canvas-root .footer-toolbar svg {
          width: 20px !important;
          height: 20px !important;
        }
        .new-canvas-root .canvas-zoom-slider {
          width: 120px !important;
          height: 6px !important;
        }
        .new-canvas-root .footer-toolbar .text-xs {
          width: auto !important;
          font-size: 14px !important;
        }
        .new-canvas-root .footer-toolbar .canvas-controls {
          position: static !important;
          inset: auto !important;
          margin: 0 !important;
          transform: none !important;
          display: flex !important;
          flex-direction: row !important;
          background: transparent !important;
          border: 0 !important;
          border-radius: 0 !important;
          box-shadow: none !important;
        }
        .new-canvas-root .footer-toolbar .react-flow__panel:has(> .canvas-controls) {
          position: static !important;
          inset: auto !important;
          margin: 0 !important;
          transform: none !important;
        }
        .new-canvas-root .canvas-drawing-toolbar {
          gap: 6px !important;
          padding: 6px !important;
        }
        .new-canvas-root .canvas-drawing-tool {
          width: 40px !important;
          height: 40px !important;
          flex-basis: 40px !important;
        }
        .new-canvas-root .canvas-drawing-tool-separator {
          flex: 0 0 1px !important;
          width: 1px !important;
          height: 20px !important;
          margin: 0 2px !important;
        }
        .new-canvas-root .canvas-drawing-tool svg {
          width: 22px !important;
          height: 22px !important;
        }
        .new-canvas-root .canvas-drawing-toolbar-slot {
          left: 50% !important;
          bottom: 12px !important;
          transform: translateX(-50%) !important;
          width: max-content !important;
          height: auto !important;
          margin: 0 !important;
          overflow: visible !important;
        }
        .new-canvas-root .canvas-drawing-toolbar-wrap {
          position: relative !important;
          display: flex !important;
          align-items: center !important;
        }
        .new-canvas-root .canvas-note-style-panel-anchor {
          position: absolute !important;
          left: clamp(144px, calc(6px + 40px + 6px + 5px + 6px + (var(--canvas-note-tool-index, 1) - 1) * 46px + 20px), calc(100% - 144px)) !important;
          right: auto !important;
          bottom: calc(100% + 8px) !important;
          transform: translateX(-50%) !important;
          z-index: 41 !important;
          pointer-events: auto !important;
        }
        .new-canvas-root .canvas-zoom-slot,
        .new-canvas-root .react-flow__panel.bottom.right:has(> .footer-toolbar) {
          left: 12px !important;
          right: auto !important;
          bottom: 12px !important;
          transform: none !important;
        }
        .new-canvas-root .app-shell {
          --chat-panel-width: 600px;
        }
        .new-canvas-root .chat-panel,
        .new-canvas-root .chat-panel-header,
        .new-canvas-root .chat-panel-input-area,
        .new-canvas-root .chat-panel * {
          -webkit-backdrop-filter: none !important;
          backdrop-filter: none !important;
        }
        .new-canvas-root .chat-panel {
          top: 12px !important;
          bottom: 12px !important;
          height: auto !important;
          width: var(--chat-panel-width, min(600px, calc(100vw - 24px))) !important;
          max-width: calc(100vw - 24px) !important;
        }
        .new-canvas-root .chat-panel .chat-panel-textarea {
          min-height: 92px !important;
          max-height: 220px !important;
        }
        .new-canvas-root .chat-panel div:has(> .chat-panel-textarea) {
          min-height: 92px !important;
          max-height: 220px !important;
        }
        .new-canvas-root .chat-panel div:has(> .chat-panel-textarea) > span {
          line-height: 22px !important;
        }
        .new-canvas-root .react-flow__minimap {
          left: 12px !important;
          right: auto !important;
          bottom: 72px !important;
          transform: none !important;
        }
        .new-canvas-root .minimap-stats-zone {
          position: absolute !important;
          left: 12px !important;
          right: auto !important;
          bottom: 72px !important;
          width: 180px !important;
          height: 120px !important;
          margin: 0 !important;
          transform: none !important;
          overflow: visible !important;
          z-index: 7 !important;
        }
        .new-canvas-root .minimap-stats-zone > .react-flow__minimap {
          position: relative !important;
          inset: auto !important;
          margin: 0 !important;
        }
        .new-canvas-root .minimap-stats-card {
          position: absolute !important;
          left: 0 !important;
          bottom: calc(100% + 8px) !important;
          min-width: 152px;
          pointer-events: none;
        }
        .new-canvas-root .react-flow__panel.bottom.right:has(.footer-toolbar) {
          left: 12px !important;
          right: auto !important;
          bottom: 12px !important;
          transform: none !important;
        }
        .new-canvas-root .react-flow__controls.canvas-controls {
          position: absolute !important;
          left: auto !important;
          right: 12px !important;
          bottom: 12px !important;
          margin: 0 !important;
          transform: none !important;
          display: flex !important;
          flex-direction: row !important;
        }
        .new-canvas-root .app-shell:has(.chat-panel) .react-flow__controls.canvas-controls {
          right: calc(var(--chat-panel-width, 600px) + 24px) !important;
        }
        .new-canvas-root .footer-toolbar .react-flow__controls.canvas-controls {
          position: static !important;
          inset: auto !important;
          right: auto !important;
          margin: 0 !important;
          transform: none !important;
        }
        .new-canvas-root .canvas-controls .react-flow__controls-button {
          width: 40px !important;
          height: 40px !important;
        }
        .new-canvas-root .canvas-controls .react-flow__controls-button svg {
          max-width: 20px !important;
          max-height: 20px !important;
        }
      ` : `
        .ai-canvas-standalone-mount,
        .ai-canvas-standalone-mount .new-canvas-root,
        .ai-canvas-standalone-mount .new-canvas-root > .app-shell {
          width: 100% !important;
          height: 100% !important;
          min-height: 0 !important;
        }
        .app-header {
          gap: 4px !important;
          padding: 10px !important;
          min-height: 72px !important;
          min-width: 440px !important;
          font-size: 16px !important;
        }
        .app-header button {
          min-width: 56px !important;
          min-height: 56px !important;
          font-size: 20px !important;
        }
        .app-header [contenteditable="true"] {
          min-width: 180px !important;
          max-width: 260px !important;
          font-size: 20px !important;
          line-height: 1.4 !important;
        }
        .app-header span {
          font-size: 20px !important;
          line-height: 1.4 !important;
        }
        .app-header img {
          width: 48px !important;
          height: 48px !important;
        }
        .new-canvas-root .sidebar-floating {
          top: 12px !important;
          left: auto !important;
          right: 12px !important;
          width: max-content !important;
          max-width: calc(100% - 24px) !important;
          height: auto !important;
          flex-direction: row !important;
          gap: 4px !important;
          padding: 7px !important;
          transform: none !important;
        }
        .new-canvas-root .sidebar-floating .sidebar-btn-v3 {
          width: 44px !important;
          height: 44px !important;
        }
        .new-canvas-root .sidebar-floating .sidebar-btn-v3 svg {
          width: 24px !important;
          height: 24px !important;
        }
        .new-canvas-root .sidebar-floating {
          transition: none !important;
        }
        .new-canvas-root .app-shell:has(.chat-panel) .sidebar-floating {
          right: calc(var(--chat-panel-width, 600px) + 24px) !important;
        }
        .sidebar-floating {
          top: 12px !important;
          left: auto !important;
          right: 12px !important;
          width: max-content !important;
          max-width: calc(100% - 24px) !important;
          height: auto !important;
          flex-direction: row !important;
          gap: 4px !important;
          padding: 7px !important;
          transform: none !important;
        }
        .sidebar-floating .sidebar-btn-v3 {
          width: 44px !important;
          height: 44px !important;
        }
        .sidebar-floating .sidebar-btn-v3 svg {
          width: 24px !important;
          height: 24px !important;
        }
        .app-shell:has(.chat-panel) .sidebar-floating {
          right: calc(var(--chat-panel-width, 600px) + 24px) !important;
        }
        .new-canvas-root .model-selector {
          flex: 0 0 auto !important;
          width: 32px !important;
        }
        .new-canvas-root .model-selector-trigger {
          width: 32px !important;
          height: 32px !important;
          justify-content: center !important;
          padding: 0 !important;
        }
        .new-canvas-root .model-selector-label,
        .new-canvas-root .model-selector-trigger .caret {
          display: none !important;
        }
        .new-canvas-root .footer-toolbar {
          gap: 8px !important;
          padding: 6px 8px !important;
        }
        .new-canvas-root .footer-toolbar button {
          width: 40px !important;
          height: 40px !important;
        }
        .new-canvas-root .footer-toolbar svg {
          width: 20px !important;
          height: 20px !important;
        }
        .new-canvas-root .canvas-zoom-slider {
          width: 120px !important;
          height: 6px !important;
        }
        .new-canvas-root .footer-toolbar .text-xs {
          width: auto !important;
          font-size: 14px !important;
        }
        .new-canvas-root .footer-toolbar .canvas-controls {
          position: static !important;
          inset: auto !important;
          margin: 0 !important;
          transform: none !important;
          display: flex !important;
          flex-direction: row !important;
          background: transparent !important;
          border: 0 !important;
          border-radius: 0 !important;
          box-shadow: none !important;
        }
        .new-canvas-root .footer-toolbar .react-flow__panel:has(> .canvas-controls) {
          position: static !important;
          inset: auto !important;
          margin: 0 !important;
          transform: none !important;
        }
        .new-canvas-root .canvas-drawing-toolbar {
          gap: 6px !important;
          padding: 6px !important;
        }
        .new-canvas-root .canvas-drawing-tool {
          width: 40px !important;
          height: 40px !important;
          flex-basis: 40px !important;
        }
        .new-canvas-root .canvas-drawing-tool-separator {
          flex: 0 0 1px !important;
          width: 1px !important;
          height: 20px !important;
          margin: 0 2px !important;
        }
        .new-canvas-root .canvas-drawing-tool svg {
          width: 22px !important;
          height: 22px !important;
        }
        .new-canvas-root .canvas-drawing-toolbar-slot {
          left: 50% !important;
          bottom: 12px !important;
          transform: translateX(-50%) !important;
          width: max-content !important;
          height: auto !important;
          margin: 0 !important;
          overflow: visible !important;
        }
        .new-canvas-root .canvas-drawing-toolbar-wrap {
          position: relative !important;
          display: flex !important;
          align-items: center !important;
        }
        .new-canvas-root .canvas-note-style-panel-anchor {
          position: absolute !important;
          left: clamp(144px, calc(6px + 40px + 6px + 5px + 6px + (var(--canvas-note-tool-index, 1) - 1) * 46px + 20px), calc(100% - 144px)) !important;
          right: auto !important;
          bottom: calc(100% + 8px) !important;
          transform: translateX(-50%) !important;
          z-index: 41 !important;
          pointer-events: auto !important;
        }
        .new-canvas-root .canvas-zoom-slot,
        .new-canvas-root .react-flow__panel.bottom.right:has(> .footer-toolbar) {
          left: 12px !important;
          right: auto !important;
          bottom: 12px !important;
          transform: none !important;
        }
        .new-canvas-root .app-shell {
          --chat-panel-width: 600px;
        }
        .new-canvas-root .chat-panel,
        .new-canvas-root .chat-panel-header,
        .new-canvas-root .chat-panel-input-area,
        .new-canvas-root .chat-panel * {
          -webkit-backdrop-filter: none !important;
          backdrop-filter: none !important;
        }
        .new-canvas-root .chat-panel {
          top: 12px !important;
          bottom: 12px !important;
          height: auto !important;
          width: var(--chat-panel-width, min(600px, calc(100vw - 24px))) !important;
          max-width: calc(100vw - 24px) !important;
        }
        .new-canvas-root .chat-panel .chat-panel-textarea {
          min-height: 92px !important;
          max-height: 220px !important;
        }
        .new-canvas-root .chat-panel div:has(> .chat-panel-textarea) {
          min-height: 92px !important;
          max-height: 220px !important;
        }
        .new-canvas-root .chat-panel div:has(> .chat-panel-textarea) > span {
          line-height: 22px !important;
        }
        .new-canvas-root .react-flow__minimap {
          left: 12px !important;
          right: auto !important;
          bottom: 72px !important;
          transform: none !important;
        }
        .new-canvas-root .minimap-stats-zone {
          position: absolute !important;
          left: 12px !important;
          right: auto !important;
          bottom: 72px !important;
          width: 180px !important;
          height: 120px !important;
          margin: 0 !important;
          transform: none !important;
          overflow: visible !important;
          z-index: 7 !important;
        }
        .new-canvas-root .minimap-stats-zone > .react-flow__minimap {
          position: relative !important;
          inset: auto !important;
          margin: 0 !important;
        }
        .new-canvas-root .minimap-stats-card {
          position: absolute !important;
          left: 0 !important;
          bottom: calc(100% + 8px) !important;
          min-width: 152px;
          pointer-events: none;
        }
        .new-canvas-root .react-flow__panel.bottom.right:has(.footer-toolbar) {
          left: 12px !important;
          right: auto !important;
          bottom: 12px !important;
          transform: none !important;
        }
        .new-canvas-root .react-flow__controls.canvas-controls {
          position: absolute !important;
          left: auto !important;
          right: 12px !important;
          bottom: 12px !important;
          margin: 0 !important;
          transform: none !important;
          display: flex !important;
          flex-direction: row !important;
        }
        .new-canvas-root .app-shell:has(.chat-panel) .react-flow__controls.canvas-controls {
          right: calc(var(--chat-panel-width, 600px) + 24px) !important;
        }
        .new-canvas-root .footer-toolbar .react-flow__controls.canvas-controls {
          position: static !important;
          inset: auto !important;
          right: auto !important;
          margin: 0 !important;
          transform: none !important;
        }
        .new-canvas-root .canvas-controls .react-flow__controls-button {
          width: 40px !important;
          height: 40px !important;
        }
        .new-canvas-root .canvas-controls .react-flow__controls-button svg {
          max-width: 20px !important;
          max-height: 20px !important;
        }
        @media (min-width: 769px) {
          .ai-canvas-standalone-mount {
            height: calc(100dvh / var(--app-ui-scale, 1)) !important;
          }
          .ai-canvas-standalone-mount > [data-new-canvas-light-dom-root] {
            width: 100% !important;
            height: 100% !important;
            min-height: 100% !important;
            zoom: calc(1 / var(--app-ui-scale, 1));
          }
          .ai-canvas-standalone-mount > [data-new-canvas-light-dom-root] > .new-canvas-root {
            width: 100% !important;
            height: 100% !important;
            min-height: 100% !important;
          }
          .ai-canvas-standalone-mount > [data-new-canvas-light-dom-root] > [data-new-canvas-style-gate],
          .ai-canvas-standalone-mount .new-canvas-loading-skeleton {
            width: 100% !important;
            height: 100% !important;
            min-height: 100% !important;
          }
          .app-tooltip {
            zoom: calc(1 / var(--app-ui-scale, 1));
          }
        }
      `;
      layoutStyle.textContent += `
        html:has(.ai-canvas-standalone-mount),
        body.workbench-body:has(.ai-canvas-standalone-mount) {
          position: static !important;
          inset: auto !important;
          background: var(--theme-app-background, #08111b) !important;
        }
        body.workbench-body:has(.ai-canvas-standalone-mount)::after {
          opacity: 0 !important;
        }
        .ai-canvas-standalone-mount .app-shell--glass-frame::before,
        .ai-canvas-standalone-mount .app-shell--glass-frame::after {
          opacity: 0 !important;
        }
        .ai-canvas-standalone-mount [aria-label="AI Canvas 正在启动"] {
          display: none !important;
        }
      `;
      styleRoot.append(layoutStyle);
    }
    if (styleRoot?.querySelector && !styleRoot.querySelector(`link[data-ai-canvas-runtime-style="true"]`)) {
      const stylesheet = document.createElement("link");
      stylesheet.rel = "stylesheet";
      stylesheet.href = stylesheetHref;
      stylesheet.dataset.aiCanvasRuntimeStyle = "true";
      styleRoot.append(stylesheet);
    }
    const themeBridge = createAiCanvasRuntimeThemeBridge(surface, context.theme);
    const configBridge = createAiCanvasRuntimeConfigBridge(runtimeStore, context.theme);
    const catalogBridge = createAiCanvasRuntimeCatalogBridge(runtimeStore, context);
    const scaleBridge = createAiCanvasRuntimeScaleBridge(surface, {
      lightDom: !isShadowRoot,
    });
    const runtimeContext = {
      // Keep the host bridge available to runtime extensions. The bundled
      // renderer currently consumes the catalog through the store bridge below;
      // no provider credentials are included in this context.
      creatorApi: context.creatorApi ?? context.api,
      api: context.api ?? context.creatorApi,
      modelCatalog: context.modelCatalog ?? context.models,
      skillCatalog: context.skillCatalog ?? context.skills,
      ...(context.document !== undefined || context.canvasDocument !== undefined
        ? {
            document: normalizeAiCanvasRuntimeDocument(
              context.document ?? context.canvasDocument,
              context.currentProjectId ?? context.canvasProjectId,
              { recoverStaleGenerating: true },
            ),
          }
        : {}),
      view: null,
      embedded: context.embedded !== false,
      theme: normalizeAiCanvasTheme(context.theme),
      projectCatalog: context.projectCatalog,
      currentProjectId: context.currentProjectId ?? context.canvasProjectId,
      onSwitchProject: context.onSwitchProject,
      onCreateProject: context.onCreateProject,
      onRenameProject: context.onRenameProject,
      onDeleteProject: context.onDeleteProject,
      onDuplicateProject: context.onDuplicateProject,
      onExportProject: context.onExportProject,
      onImportProject: context.onImportProject,
      onOpenHome: context.onOpenHome,
      onOpenProjects: context.onOpenProjects,
      onDirectorDeskOpen: context.onDirectorDeskOpen,
      onDirectorDeskSyncFrame: context.onDirectorDeskSyncFrame,
      onDirectorDeskExportVideo: context.onDirectorDeskExportVideo,
      onVideoEditorOpen: context.onVideoEditorOpen,
      onVideoEditorOpenShotlist: context.onVideoEditorOpenShotlist,
      onDocumentChange: (document, metadata = {}) => context.syncDocument?.(document, metadata),
      onGenerationTaskCreated: context.onGenerationTaskCreated,
      taskCenterActiveCount: Number(context.taskCenterActiveCount ?? 0) || 0,
    };
    const applyTaskCenterActiveCount = (next = runtimeContext) => {
      if (!runtimeStore?.setState) return;
      if (next !== runtimeContext && !Object.prototype.hasOwnProperty.call(next, "taskCenterActiveCount")) return;
      const count = Number(next.taskCenterActiveCount ?? runtimeContext.taskCenterActiveCount ?? 0);
      const nextCount = Number.isFinite(count) ? Math.max(0, count) : 0;
      runtimeContext.taskCenterActiveCount = nextCount;
      if (Number(runtimeStore.getState?.()?.taskCenterActiveCount ?? 0) === nextCount) return;
      runtimeStore.setState({ taskCenterActiveCount: nextCount });
    };
    applyTaskCenterActiveCount();
    const hostProjectGuard = createAiCanvasRuntimeHostProjectGuard(runtimeStore, runtimeContext);
    const runtimeWindow = surface?.ownerDocument?.defaultView ?? globalThis;
    const onOpenProjectTaskCenter = (event) => {
      if (typeof context.onOpenTaskCenter !== "function") return;
      event.preventDefault();
      // Let the runtime finish its React click dispatch before the host replaces
      // the surrounding workbench chrome and updates the mounted canvas.
      globalThis.setTimeout?.(() => {
        void Promise.resolve(context.onOpenTaskCenter()).catch((error) => {
          console.warn("[creator-app] project task center unavailable", error);
        });
      }, 0);
    };
    runtimeWindow?.addEventListener?.("ai-canvas-open-project-task-center", onOpenProjectTaskCenter);
    const taskCenterBridge = installAiCanvasAssistantTaskCenterBridge(runtimeWindow, {
      ...context,
      ...runtimeContext,
      runtimeStore,
    });
    let unsubscribeAssistantPreference = () => {};
    let disposeHeaderChrome = () => {};
    let disposeFooterZoomControls = () => {};
    let disposePromptCreditCost = () => {};
    const projectBridgePromise = createAiCanvasRuntimeProjectBridge({
        ...context,
        ...runtimeContext,
      });
    return projectBridgePromise.then((projectBridge) => mountAiCanvasRuntime(surface, runtimeContext).then(async (runtimeHandle) => {
      hostProjectGuard.enableSaves?.();
      await ensureAiCanvasRuntimeDefaultConversation(runtimeStore, runtimeContext);
      openAiCanvasRuntimeAssistant(runtimeStore);
      unsubscribeAssistantPreference = subscribeAiCanvasRuntimeAssistantPreference(runtimeStore);
      disposeHeaderChrome = installAiCanvasRuntimeHeaderChrome(surface, runtimeStore, runtimeContext);
      disposeFooterZoomControls = installAiCanvasRuntimeFooterZoomControls(surface);
      disposePromptCreditCost = installAiCanvasRuntimePromptCreditCost(surface, runtimeStore);
      return ({
      ...runtimeHandle,
      async update(next = {}) {
        if (next.theme !== undefined) {
          themeBridge.update(next.theme);
          configBridge.update(next.theme);
        }
        catalogBridge.update(next);
        hostProjectGuard.update(next);
        projectBridge.update(next);
        applyTaskCenterActiveCount(next);
        return runtimeHandle?.update?.(next);
      },
      async dispose() {
        try {
          unsubscribeAssistantPreference();
          disposeHeaderChrome();
          disposeFooterZoomControls();
          disposePromptCreditCost();
          runtimeWindow?.removeEventListener?.("ai-canvas-open-project-task-center", onOpenProjectTaskCenter);
          taskCenterBridge.dispose();
          projectBridge.dispose();
          await runtimeHandle?.dispose?.();
        } finally {
          hostProjectGuard.dispose();
          themeBridge.dispose();
          configBridge.dispose();
          catalogBridge.dispose();
          scaleBridge.dispose();
          releaseAiCanvasRuntimeGlobalStyle(globalStylesheet);
        }
      },
      });
    }).catch((error) => {
      unsubscribeAssistantPreference();
      disposeHeaderChrome();
      disposeFooterZoomControls();
      runtimeWindow?.removeEventListener?.("ai-canvas-open-project-task-center", onOpenProjectTaskCenter);
      taskCenterBridge.dispose();
      projectBridge.dispose();
      throw error;
    })).catch((error) => {
      unsubscribeAssistantPreference();
      disposeHeaderChrome();
      disposeFooterZoomControls();
      taskCenterBridge.dispose();
      hostProjectGuard.dispose();
      themeBridge.dispose();
      configBridge.dispose();
      catalogBridge.dispose();
      scaleBridge.dispose();
      releaseAiCanvasRuntimeGlobalStyle(globalStylesheet);
      throw error;
    });
  });
}
const homeUrl =
  window.location.protocol === "file:"
    ? resolveApiUrl("/app.html")
    : new URL("/", window.location.origin).toString();
const LOCAL_STORAGE_PREFIXES = ["comic-ai-project-library", "comic-ai:production-workbench:"];
const OPEN_CREATE_AFTER_LOGIN_KEY = "comic-ai:open-create-after-login";
const CODE_REQUEST_COOLDOWN_SECONDS = 60;
const GLOBAL_TOAST_DURATION_MS = 2000;
const ANONYMOUS_READ_API_METHODS = new Set(["getStoryboardPromptPackages", "getCustomerSupportConfig", "getAnnouncements", "getPromptMarketplace", "getHomeRecommendations", "getSkills"]);

async function bootstrap() {
  renderInitialWorkbenchShell(root);
  const sessionPromise = creatorApi.getSession();
  const { initProductionWorkbench } = await productionWorkbenchPromise;
  let activeSession = createAnonymousSession();
  const workbench = await initProductionWorkbench({
    root,
    session: activeSession,
    api: createAnonymousApi(creatorApi),
    aiCanvasRuntime: globalThis.__COMIC_AI_AI_CANVAS_RUNTIME__ ?? null,
    aiCanvasRuntimeAdapter: globalThis.__COMIC_AI_AI_CANVAS_RUNTIME_ADAPTER__ ?? null,
    mountAiCanvasRuntime: globalThis.__COMIC_AI_MOUNT_AI_CANVAS_RUNTIME__ ?? mountStandaloneAiCanvasRuntime,
    deferInitialRender: true,
    onLogout: async () => {
      if (!activeSession?.user?.id && !activeSession?.user?.phone) {
        clearCreatorBrowserStorage();
        openLoginModal();
        return;
      }
      await creatorApi.logout();
      clearCreatorBrowserStorage();
      window.location.replace(homeUrl);
    },
    onRequireLogin: handleRequireLogin,
  });

  await sessionPromise.then(async (session) => {
    session = consumeFirstLoginOnboarding(session, sessionStorage);
    activeSession = session;
    resolvePublicSeoContentForSession(session);
    await workbench?.updateSession?.(session, creatorApi);
  }).catch(async (error) => {
    const message = error instanceof Error ? error.message : "unknown_error";
    activeSession = createAnonymousSession();
    resolvePublicSeoContentForSession(activeSession);
    if (message === "unauthenticated") {
      await workbench?.updateSession?.(activeSession, createAnonymousApi(creatorApi));
      if (hasInviteCodeInUrl()) {
        openLoginModal();
      }
      return;
    }
    console.error("[creator-app] bootstrap:error", error);
    activeSession = {
      authenticated: false,
      user: {
        id: "",
        phone: "",
      },
      bootstrapError: message,
    };
    await workbench?.updateSession?.(activeSession, createRecoverableApi(creatorApi, message));
  });
}

function renderInitialWorkbenchShell(target) {
  if (!target || target.querySelector?.(".initial-workbench-shell")) {
    return;
  }
  target.innerHTML = `
    <section class="initial-workbench-shell" aria-busy="true" aria-live="polite">
      <strong>灵曦AI</strong>
      <span>正在加载工作台...</span>
    </section>
  `;
}

function resolvePublicSeoContentForSession(session) {
  document.querySelector(".public-seo-content")?.remove();
  document.body.classList.remove("public-seo-page");
  document.body.classList.remove("public-seo-session-pending");
}

function createAnonymousSession() {
  return {
    authenticated: false,
    user: {
      id: "",
      phone: "",
    },
  };
}

function hasInviteCodeInUrl() {
  return Boolean(new URLSearchParams(window.location.search).get("inviteCode")?.trim());
}

function createAnonymousApi(api) {
  return new Proxy(api, {
    get(target, property, receiver) {
      if (property === "getSession") {
        return async () => createAnonymousSession();
      }
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") {
        return value;
      }
      if (ANONYMOUS_READ_API_METHODS.has(String(property))) {
        return value.bind(target);
      }
      return async (...args) => {
        if (isAnonymousReadApiCall(property, args)) {
          return value.apply(target, args);
        }
        throw new Error("unauthenticated");
      };
    },
  });
}

function isAnonymousReadApiCall(property, args = []) {
  const method = String(property);
  if (ANONYMOUS_READ_API_METHODS.has(method)) {
    return true;
  }
  if (method !== "getLibraryAssets") {
    return false;
  }
  const scope = String(args[0]?.scope ?? "official").trim() || "official";
  return scope === "official";
}

function createRecoverableApi(api, bootstrapError) {
  return new Proxy(api, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (property === "getSession") {
        return async () => ({
          authenticated: false,
          user: { id: "", phone: "" },
          bootstrapError,
        });
      }
      return value;
    },
  });
}

function clearCreatorBrowserStorage() {
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key && LOCAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Storage can be blocked in private or file-based browser contexts.
  }

  try {
    sessionStorage.clear();
  } catch {
    // Keep navigation working even when browser storage is unavailable.
  }
}

function handleRequireLogin(reason = "") {
  if (reason === "create-project") {
    try {
      sessionStorage.setItem(OPEN_CREATE_AFTER_LOGIN_KEY, "1");
    } catch {
      // Ignore blocked storage; the login modal still works.
    }
  }
  openLoginModal();
}

export function openLoginModal() {
  if (document.querySelector("#app-login-modal")) {
    return;
  }
  const modal = document.createElement("section");
  modal.id = "app-login-modal";
  modal.className = "app-login-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", "登录灵曦AI");
  modal.innerHTML = renderLoginModalMarkup();
  document.body.appendChild(modal);
  modal.querySelectorAll("[data-login-modal-close]").forEach((button) => {
    button.addEventListener("click", closeLoginModal);
  });
  bindLoginModal(modal);
}

document.addEventListener("click", (event) => {
  const loginTrigger = event.target?.closest?.("[data-public-seo-login]");
  if (!loginTrigger) {
    return;
  }
  event.preventDefault();
  openLoginModal();
});

function closeLoginModal() {
  document.querySelector("#app-login-modal")?.remove();
  try {
    sessionStorage.removeItem(OPEN_CREATE_AFTER_LOGIN_KEY);
  } catch {
    // Ignore blocked storage.
  }
}

function readOpenCreateAfterLoginFlag() {
  try {
    return sessionStorage.getItem(OPEN_CREATE_AFTER_LOGIN_KEY) === "1";
  } catch {
    return false;
  }
}

function renderLoginModalMarkup() {
  return `
    <button class="app-login-modal-backdrop" type="button" data-login-modal-close aria-label="关闭登录"></button>
    <div class="app-login-modal-panel">
      <button class="app-login-modal-close" type="button" data-login-modal-close aria-label="关闭登录">×</button>
      <section class="auth-panel" data-auth-mode="phone">
        <div class="auth-mode-tabs" role="tablist" aria-label="登录方式">
          <button id="phone-login-tab" class="auth-mode-tab" type="button" role="tab" aria-selected="true" aria-controls="phone-login-panel" data-auth-target="phone">验证码登录</button>
          <button id="password-login-tab" class="auth-mode-tab" type="button" role="tab" aria-selected="false" aria-controls="password-login-panel" data-auth-target="password">密码登录</button>
          <button id="team-login-tab" class="auth-mode-tab" type="button" role="tab" aria-selected="false" aria-controls="password-login-panel" data-auth-target="team">团队登录</button>
        </div>

        <div id="phone-login-panel" class="auth-mode-panel" role="tabpanel" aria-labelledby="phone-login-tab">
          <form id="login-form" class="login-form">
            <label class="field">
              <span class="sr-only">手机号</span>
              <input id="phone-input" name="phone" inputmode="numeric" maxlength="11" placeholder="请输入11位手机号（不带+86）" autocomplete="tel" />
            </label>
            <label class="field field-inline">
              <span class="sr-only">验证码</span>
              <span class="field-control">
                <input id="code-input" name="code" inputmode="numeric" maxlength="6" placeholder="请输入验证码" autocomplete="one-time-code" />
                <button id="request-code-button" class="secondary-action inline-action" type="button">发送验证码</button>
              </span>
            </label>
            <label class="field">
              <span class="sr-only">邀请码</span>
              <input id="invite-code-input" name="inviteCode" type="text" placeholder="请输入邀请码（选填）" autocomplete="off" />
            </label>
            <p id="registration-password-hint" class="registration-password-hint" role="note">
              注册默认密码为<span>手机号后六位</span>，请注意修改
            </p>
            <div class="form-options">
              <label class="remember-option">
                <input id="phone-remember-input" type="checkbox" name="remember" checked />
                <span>保持登录</span>
              </label>
            </div>
            <button id="verify-button" class="primary-action" type="submit">立即登录</button>
          </form>
        </div>

        <div id="password-login-panel" class="auth-mode-panel" role="tabpanel" aria-labelledby="password-login-tab" hidden>
          <form id="password-login-form" class="login-form password-form">
            <label class="field">
              <span class="sr-only">账号</span>
              <input id="account-input" name="account" type="text" placeholder="请输入手机号" autocomplete="username" />
            </label>
            <label class="field">
              <span class="sr-only">密码</span>
              <span class="password-input-shell">
                <input id="password-input" name="password" type="password" placeholder="请输入密码" autocomplete="current-password" />
                <button id="password-visibility-toggle" class="password-visibility-toggle" type="button" aria-label="显示密码">
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M2.8 12s3.2-5.2 9.2-5.2S21.2 12 21.2 12s-3.2 5.2-9.2 5.2S2.8 12 2.8 12z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
                    <circle cx="12" cy="12" r="2.5" stroke="currentColor" stroke-width="1.7"/>
                  </svg>
                </button>
              </span>
            </label>
            <div class="password-options">
              <label class="remember-option">
                <input id="password-remember-input" type="checkbox" name="remember" checked />
                <span>保持登录</span>
              </label>
              <button id="forgot-password-button" type="button" class="text-action">忘记密码？</button>
            </div>
            <button id="password-login-button" class="primary-action" type="submit">立即登录</button>
          </form>
        </div>

        <div class="social-login">
          <div class="social-divider">
            <span class="social-divider-line"></span>
            <span class="social-divider-text">其他方式登录</span>
            <span class="social-divider-line"></span>
          </div>
          <div class="social-icons" role="group" aria-label="第三方登录方式">
            <button type="button" class="social-btn wechat" aria-label="微信登录" data-provider-label="微信">微</button>
            <button type="button" class="social-btn qq" aria-label="QQ登录" data-provider-label="QQ">Q</button>
            <button type="button" class="social-btn apple" aria-label="Apple 登录" data-provider-label="Apple">A</button>
            <button type="button" class="social-btn douyin" aria-label="抖音登录" data-provider-label="抖音">抖</button>
          </div>
        </div>

        <div class="agreements-section">
          <label class="agreements-check" for="agreements-checkbox">
            <input id="agreements-checkbox" type="checkbox" />
            <span class="agreement-copy">
              <span class="agreement-line">
                我已阅读并同意灵曦科技
                <button type="button" class="agreement-link" data-agreement="service">用户服务协议</button>
                和
                <button type="button" class="agreement-link" data-agreement="privacy">隐私政策</button>，
              </span>
              <span class="agreement-line">未注册手机号登录时会自动创建账号</span>
            </span>
          </label>
          <div id="agreements-error-tooltip" class="agreements-error-tooltip" hidden>请先同意并勾选上述协议</div>
        </div>

        <p id="status-message" class="status-message" aria-live="polite"></p>
      </section>
    </div>
    <div id="agreement-modal" class="agreement-modal" hidden>
      <div class="agreement-modal-backdrop" data-agreement-close></div>
      <section class="agreement-modal-panel" role="dialog" aria-modal="true" aria-labelledby="agreement-modal-title">
        <button type="button" class="agreement-modal-close" data-agreement-close aria-label="关闭协议弹窗">×</button>
        <div class="agreement-modal-head">
          <h3 id="agreement-modal-title">协议详情</h3>
        </div>
        <div id="agreement-modal-content" class="agreement-modal-content agreement-rich-text"></div>
      </section>
    </div>
  `;
}

function bindLoginModal(modal) {
  const state = {
    activeChallengeId: null,
    requestCodeCooldownTimer: null,
    requestCodeCooldownEndsAt: 0,
    globalToastTimer: null,
    agreementDocuments: {
      serviceAgreement: {
        title: "用户服务协议",
        contentHtml: "<p>协议内容加载中...</p>",
      },
      privacyPolicy: {
        title: "隐私政策",
        contentHtml: "<p>协议内容加载中...</p>",
      },
    },
    agreementDocumentsPromise: null,
  };
  const qs = (selector) => modal.querySelector(selector);
  const qsa = (selector) => [...modal.querySelectorAll(selector)];
  const form = qs("#login-form");
  const phoneInput = qs("#phone-input");
  const codeInput = qs("#code-input");
  const inviteCodeInput = qs("#invite-code-input");
  const requestCodeButton = qs("#request-code-button");
  const verifyButton = qs("#verify-button");
  const statusMessage = qs("#status-message");
  const authPanel = qs(".auth-panel");
  const phoneLoginTab = qs("#phone-login-tab");
  const passwordLoginTab = qs("#password-login-tab");
  const teamLoginTab = qs("#team-login-tab");
  const phoneLoginPanel = qs("#phone-login-panel");
  const passwordLoginPanel = qs("#password-login-panel");
  const passwordLoginForm = qs("#password-login-form");
  const phoneRememberInput = qs("#phone-remember-input");
  const accountInput = qs("#account-input");
  const passwordInput = qs("#password-input");
  const passwordRememberInput = qs("#password-remember-input");
  const passwordVisibilityToggle = qs("#password-visibility-toggle");
  const forgotPasswordButton = qs("#forgot-password-button");
  const passwordLoginButton = qs("#password-login-button");
  const agreementsCheckbox = qs("#agreements-checkbox");
  const agreementsErrorTooltip = qs("#agreements-error-tooltip");
  const agreementModal = qs("#agreement-modal");
  const agreementModalTitle = qs("#agreement-modal-title");
  const agreementModalContent = qs("#agreement-modal-content");
  const inviteCodeFromLink = new URLSearchParams(window.location.search).get("inviteCode");

  if (inviteCodeInput && inviteCodeFromLink) {
    inviteCodeInput.value = inviteCodeFromLink.trim().toUpperCase();
  }

  const setStatus = (message) => {
    if (statusMessage) {
      statusMessage.textContent = message;
    }
  };
  const selectedPasswordAccountType = () => authPanel?.dataset.authMode === "team" ? "team_member" : "user";
  const updatePasswordAccountHint = () => {
    if (!accountInput) {
      return;
    }
    const isTeamMember = selectedPasswordAccountType() === "team_member";
    accountInput.placeholder = isTeamMember
      ? "请输入子账户，例如 director001@u185715"
      : "请输入手机号";
    accountInput.inputMode = isTeamMember ? "text" : "numeric";
    accountInput.autocomplete = isTeamMember ? "username" : "tel";
  };
  const hideAgreementError = () => {
    if (agreementsErrorTooltip) {
      agreementsErrorTooltip.hidden = true;
    }
  };
  const showAgreementHint = (message) => {
    if (!agreementsErrorTooltip) {
      return false;
    }
    agreementsErrorTooltip.textContent = message;
    agreementsErrorTooltip.hidden = false;
    return false;
  };
  const showAgreementError = (message) => {
    if (!agreementsErrorTooltip) {
      return false;
    }
    agreementsErrorTooltip.textContent = message;
    agreementsErrorTooltip.hidden = false;
    agreementsCheckbox?.focus();
    return false;
  };
  const updateAgreementActionState = () => {
    const accepted = Boolean(agreementsCheckbox?.checked);
    if (accepted) {
      hideAgreementError();
    } else {
      showAgreementHint("请先同意并勾选上述协议");
    }
    [verifyButton, passwordLoginButton].forEach((button) => {
      if (!button) {
        return;
      }
      button.classList.toggle("is-disabled", !accepted);
      button.setAttribute("aria-disabled", String(!accepted));
    });
  };
  const validateAgreementsAccepted = () => {
    if (agreementsCheckbox?.checked) {
      hideAgreementError();
      updateAgreementActionState();
      return true;
    }
    const message = "请先同意并勾选上述协议";
    updateAgreementActionState();
    showAgreementError(message);
    showLoginToast(state, "error", "请先同意协议", message);
    return false;
  };
  const setAuthMode = (mode) => {
    const isPhoneMode = mode === "phone";
    const isPasswordMode = mode === "password";
    const isTeamMode = mode === "team";
    if (authPanel) {
      authPanel.dataset.authMode = mode;
    }
    phoneLoginTab?.setAttribute("aria-selected", String(isPhoneMode));
    passwordLoginTab?.setAttribute("aria-selected", String(isPasswordMode));
    teamLoginTab?.setAttribute("aria-selected", String(isTeamMode));
    if (phoneLoginPanel) {
      phoneLoginPanel.hidden = !isPhoneMode;
    }
    if (passwordLoginPanel) {
      passwordLoginPanel.hidden = isPhoneMode;
      passwordLoginPanel.setAttribute("aria-labelledby", isTeamMode ? "team-login-tab" : "password-login-tab");
    }
    if (!isPhoneMode) {
      updatePasswordAccountHint();
      setStatus("");
    }
  };
  const updateRequestCodeButton = () => {
    if (!requestCodeButton) {
      return;
    }
    const remainingSeconds = Math.max(0, Math.ceil((state.requestCodeCooldownEndsAt - Date.now()) / 1000));
    if (remainingSeconds > 0) {
      requestCodeButton.disabled = true;
      requestCodeButton.textContent = `${remainingSeconds} 秒后重新发送`;
      return;
    }
    if (state.requestCodeCooldownTimer) {
      clearInterval(state.requestCodeCooldownTimer);
      state.requestCodeCooldownTimer = null;
    }
    state.requestCodeCooldownEndsAt = 0;
    requestCodeButton.disabled = false;
    requestCodeButton.textContent = "重新发送";
  };
  const resetRequestCodeButton = (label = "获取验证码") => {
    if (state.requestCodeCooldownTimer) {
      clearInterval(state.requestCodeCooldownTimer);
      state.requestCodeCooldownTimer = null;
    }
    state.requestCodeCooldownEndsAt = 0;
    if (requestCodeButton) {
      requestCodeButton.disabled = false;
      requestCodeButton.textContent = label;
    }
  };
  const startRequestCodeCooldown = (seconds = CODE_REQUEST_COOLDOWN_SECONDS) => {
    state.requestCodeCooldownEndsAt = Date.now() + seconds * 1000;
    updateRequestCodeButton();
    if (state.requestCodeCooldownTimer) {
      clearInterval(state.requestCodeCooldownTimer);
    }
    state.requestCodeCooldownTimer = setInterval(updateRequestCodeButton, 250);
  };
  const openAgreementModal = async (kind) => {
    const documentKey = kind === "privacy" ? "privacyPolicy" : "serviceAgreement";
    let documentData = state.agreementDocuments[documentKey];
    if (agreementModalTitle) {
      agreementModalTitle.textContent = documentData?.title || "协议详情";
    }
    if (agreementModalContent) {
      agreementModalContent.innerHTML = sanitizeAgreementHtml(documentData?.contentHtml || "<p>暂无协议内容。</p>");
    }
    if (agreementModal) {
      agreementModal.hidden = false;
    }
    await loadAgreementDocuments(state);
    documentData = state.agreementDocuments[documentKey];
    if (!agreementModal || agreementModal.hidden) {
      return;
    }
    if (agreementModalTitle) {
      agreementModalTitle.textContent = documentData?.title || "协议详情";
    }
    if (agreementModalContent) {
      agreementModalContent.innerHTML = sanitizeAgreementHtml(documentData?.contentHtml || "<p>暂无协议内容。</p>");
    }
  };
  const closeAgreementModal = () => {
    if (agreementModal) {
      agreementModal.hidden = true;
    }
  };
  const completeLoginSuccess = () => {
    const shouldOpenCreate = readOpenCreateAfterLoginFlag();
    closeLoginModal();
    if (shouldOpenCreate) {
      try {
        sessionStorage.setItem(OPEN_CREATE_AFTER_LOGIN_KEY, "1");
      } catch {
        // Ignore blocked storage.
      }
    }
    window.location.reload();
  };

  requestCodeButton?.addEventListener("click", async () => {
    if (requestCodeButton.disabled || !validateAgreementsAccepted()) {
      return;
    }
    const phone = phoneInput?.value?.trim() ?? "";
    if (!isMainlandPhoneInput(phone)) {
      resetRequestCodeButton();
      showLoginToast(state, "error", "验证码发送失败", "请输入11位手机号，且不要带 +86");
      return;
    }
    requestCodeButton.disabled = true;
    requestCodeButton.textContent = "发送中...";
    let requestResponse;
    let requestPayload;
    try {
      requestResponse = await fetch(resolveApiUrl("/api/auth/code/request"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      requestPayload = await requestResponse.json();
    } catch {
      resetRequestCodeButton();
      showLoginToast(state, "error", "验证码发送失败", "网络连接异常，请稍后再试");
      return;
    }
    if (!requestResponse.ok) {
      resetRequestCodeButton();
      showLoginToast(state, "error", "验证码发送失败", authErrorMessage(requestPayload, "验证码请求失败"));
      return;
    }
    startRequestCodeCooldown();
    state.activeChallengeId = requestPayload.challengeId;
    const remainingText =
      typeof requestPayload.remainingToday === "number"
        ? `，今日还可发送 ${requestPayload.remainingToday} 次`
        : "";
    showLoginToast(state, "success", "验证码已发送", `验证码已发送至 ${requestPayload.maskedPhone}${remainingText}`);
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const phone = phoneInput?.value?.trim() ?? "";
    const code = codeInput?.value?.trim() ?? "";
    const inviteCode = inviteCodeInput?.value?.trim() ?? "";
    if (!isMainlandPhoneInput(phone)) {
      setStatus("请输入11位手机号，且不要带 +86");
      showLoginToast(state, "error", "登录失败", "请输入11位手机号，且不要带 +86");
      return;
    }
    if (!validateAgreementsAccepted()) {
      return;
    }
    if (!state.activeChallengeId) {
      showLoginToast(state, "error", "登录失败", "请先获取验证码");
      return;
    }
    setStatus("正在登录...");
    const verifyResponse = await fetch(resolveApiUrl("/api/auth/code/verify"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        challengeId: state.activeChallengeId,
        phone,
        code,
        inviteCode: inviteCode || undefined,
        remember: phoneRememberInput?.checked !== false,
      }),
      credentials: "include",
    });
    const verifyPayload = await verifyResponse.json();
    if (!verifyResponse.ok) {
      const message = authErrorMessage(verifyPayload, "登录失败");
      setStatus(message);
      showLoginToast(state, "error", "登录失败", message);
      return;
    }
    const loginMessage = `登录成功：${verifyPayload.user.phone}`;
    markFirstLoginOnboarding(verifyPayload, sessionStorage);
    setStatus(loginMessage);
    showLoginToast(state, "success", "登录成功", loginMessage);
    setTimeout(completeLoginSuccess, 350);
  });

  passwordLoginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validateAgreementsAccepted()) {
      return;
    }
    const account = accountInput?.value?.trim() ?? "";
    const password = passwordInput?.value ?? "";
    const remember = passwordRememberInput?.checked !== false;
    const accountType = selectedPasswordAccountType();
    const isTeamMemberLogin = accountType === "team_member";
    if (!isTeamMemberLogin && /^\+86/.test(account)) {
      passwordLoginButton.disabled = false;
      setStatus("请输入11位手机号，且不要带 +86");
      showLoginToast(state, "error", "密码登录失败", "请输入11位手机号，且不要带 +86");
      return;
    }
    if (isTeamMemberLogin && !account.includes("@")) {
      passwordLoginButton.disabled = false;
      setStatus("请输入完整子账户登录账号");
      showLoginToast(state, "error", "子账户登录失败", "请输入管理员创建时生成的完整账号");
      return;
    }
    passwordLoginButton.disabled = true;
    setStatus("正在登录...");
    let loginResponse;
    let loginPayload;
    try {
      loginResponse = await fetch(resolveApiUrl(
        isTeamMemberLogin
          ? "/api/auth/team-member/password/login"
          : "/api/auth/password/login",
      ), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ account, password, remember }),
        credentials: "include",
      });
      loginPayload = await readJsonResponse(loginResponse);
    } catch {
      passwordLoginButton.disabled = false;
      setStatus(isTeamMemberLogin ? "子账户登录失败" : "密码登录失败");
      showLoginToast(state, "error", isTeamMemberLogin ? "子账户登录失败" : "密码登录失败", "网络连接异常，请稍后再试");
      return;
    }
    if (!loginResponse.ok) {
      passwordLoginButton.disabled = false;
      const message = resolvePasswordLoginError(loginResponse, loginPayload, isTeamMemberLogin);
      setStatus(message);
      showLoginToast(state, "error", isTeamMemberLogin ? "子账户登录失败" : "密码登录失败", message);
      return;
    }
    const loginMessage = isTeamMemberLogin
      ? `登录成功：${loginPayload.memberName || loginPayload.memberLoginAccount}`
      : `登录成功：${loginPayload.user.phone}`;
    setStatus(loginMessage);
    showLoginToast(state, "success", "登录成功", loginMessage);
    setTimeout(completeLoginSuccess, 350);
  });

  verifyButton?.addEventListener("click", (event) => {
    if (agreementsCheckbox?.checked) {
      return;
    }
    event.preventDefault();
    validateAgreementsAccepted();
  });
  passwordLoginButton?.addEventListener("click", (event) => {
    if (agreementsCheckbox?.checked) {
      return;
    }
    event.preventDefault();
    validateAgreementsAccepted();
  });
  phoneLoginTab?.addEventListener("click", () => setAuthMode("phone"));
  passwordLoginTab?.addEventListener("click", () => setAuthMode("password"));
  teamLoginTab?.addEventListener("click", () => setAuthMode("team"));
  agreementsCheckbox?.addEventListener("change", () => {
    if (agreementsCheckbox.checked) {
      hideAgreementError();
    }
    updateAgreementActionState();
  });
  qsa("[data-agreement]").forEach((button) => {
    button.addEventListener("click", () => openAgreementModal(button.dataset.agreement));
  });
  qsa("[data-agreement-close]").forEach((button) => {
    button.addEventListener("click", closeAgreementModal);
  });
  passwordVisibilityToggle?.addEventListener("click", () => {
    if (!passwordInput) {
      return;
    }
    const isPasswordVisible = passwordInput.type === "password";
    passwordInput.type = isPasswordVisible ? "text" : "password";
    passwordVisibilityToggle.setAttribute("aria-label", isPasswordVisible ? "隐藏密码" : "显示密码");
  });
  qsa(".social-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const provider = button.dataset.providerLabel || "第三方";
      setStatus(`${provider} 登录即将上线`);
    });
  });

  forgotPasswordButton?.addEventListener("click", () => {
    if (selectedPasswordAccountType() === "team") {
      setStatus("子账户请联系主账号管理员重置密码。");
      accountInput?.focus();
      return;
    }
    const account = accountInput?.value?.trim() ?? "";
    setAuthMode("phone");
    if (isMainlandPhoneInput(account) && phoneInput) {
      phoneInput.value = account;
    }
    setStatus("请使用短信验证码恢复登录；如需重置密码，请联系平台客服。");
    phoneInput?.focus();
  });

  updatePasswordAccountHint();
  updateAgreementActionState();
}

function showLoginToast(state, type, title, detail) {
  const tone = type === "success" ? "success" : "error";
  let toast = document.querySelector("#global-toast");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "global-toast";
    toast.className = "global-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }

  toast.className = `global-toast ${tone}`;
  toast.innerHTML = "";

  const icon = document.createElement("span");
  icon.className = "global-toast-icon";
  icon.textContent = tone === "success" ? "✓" : "!";

  const copy = document.createElement("span");
  copy.className = "global-toast-copy";

  const titleNode = document.createElement("strong");
  titleNode.textContent = title;
  copy.appendChild(titleNode);

  if (detail) {
    const detailNode = document.createElement("span");
    detailNode.textContent = detail;
    copy.appendChild(detailNode);
  }

  toast.append(icon, copy);
  requestAnimationFrame(() => {
    toast.classList.add("visible");
  });

  if (state.globalToastTimer) {
    clearTimeout(state.globalToastTimer);
  }

  state.globalToastTimer = setTimeout(() => {
    toast.classList.remove("visible");
    state.globalToastTimer = setTimeout(() => {
      toast.remove();
      state.globalToastTimer = null;
    }, 220);
  }, GLOBAL_TOAST_DURATION_MS);
}

function sanitizeAgreementHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = String(html || "");
  const blockedTags = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META"]);
  template.content.querySelectorAll("*").forEach((element) => {
    if (blockedTags.has(element.tagName)) {
      element.remove();
      return;
    }
    Array.from(element.attributes).forEach((attribute) => {
      if (/^on/i.test(attribute.name)) {
        element.removeAttribute(attribute.name);
        return;
      }
      if (["href", "src", "xlink:href"].includes(attribute.name) && /^\s*javascript:/i.test(attribute.value)) {
        element.removeAttribute(attribute.name);
      }
    });
    if (element.tagName === "A") {
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer");
    }
  });
  return template.innerHTML;
}

async function loadAgreementDocuments(state) {
  if (state.agreementDocumentsPromise) {
    return state.agreementDocumentsPromise;
  }
  state.agreementDocumentsPromise = (async () => {
    try {
      const response = await fetch(resolveApiUrl("/api/public/legal-documents"), {
        credentials: "include",
      });
      const payload = await response.json();
      if (!response.ok) {
        return;
      }
      state.agreementDocuments = {
        serviceAgreement: payload.data?.serviceAgreement?.document || state.agreementDocuments.serviceAgreement,
        privacyPolicy: payload.data?.privacyPolicy?.document || state.agreementDocuments.privacyPolicy,
      };
    } catch {
      // Keep fallback copy when the public agreement endpoint is unavailable.
    }
  })();
  return state.agreementDocumentsPromise;
}

const authErrorCopy = {
  invalid_phone: "请输入正确的中国大陆手机号",
  sms_cooldown_active: "验证码已发送，请稍后再试",
  daily_sms_limit_exceeded: "当前手机号发送验证码频繁，请于明日再试或前往密码登录。",
  ip_sms_limit_exceeded: "当前ip发送次数过多。",
  sms_send_failed: "短信发送失败，请稍后再试",
  code_invalid: "验证码不正确",
  challenge_expired: "验证码已过期，请重新获取",
  verify_locked: "尝试次数过多，请重新获取验证码",
};

function isMainlandPhoneInput(value) {
  return /^1\d{10}$/.test(String(value || "").trim());
}

function authErrorMessage(payload, fallback) {
  if (payload?.error === "sms_cooldown_active") {
    const cooldownSeconds = Number(payload.cooldownSeconds ?? 0);
    if (cooldownSeconds >= 10 * 60) {
      return "验证码发送频繁，请10分钟后再试";
    }
    if (cooldownSeconds >= 5 * 60) {
      return "验证码发送频繁，请5分钟后再试";
    }
  }
  return authErrorCopy[payload?.error] ?? fallback;
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function resolvePasswordLoginError(response, payload, isTeamMemberLogin) {
  if (isTeamMemberLogin) {
    if (payload?.error === "team_member_disabled") {
      return "子账户已被禁用";
    }
    if (payload?.error === "team_member_deleted") {
      return "子账户已被删除";
    }
    if (payload?.error === "user_disabled") {
      return "管理员账号已被禁用";
    }
    return response.status === 404 ? "子账户登录接口未启动，请重启本地服务" : "子账户或密码不正确";
  }
  if (payload?.error === "invalid_phone") {
    return "请输入正确的手机号";
  }
  if (payload?.error === "user_disabled") {
    return "账号已被禁用";
  }
  return response.status === 404 ? "密码登录接口未启动，请重启本地服务" : "账号或密码不正确";
}

if (root) {
  bootstrap();
}
