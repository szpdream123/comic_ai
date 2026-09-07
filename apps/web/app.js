import { creatorApi, resolveApiUrl } from "./src/shared/creator-api.js";
import {
  consumeFirstLoginOnboarding,
  markFirstLoginOnboarding,
} from "./src/features/production-workbench/first-login-onboarding.js";
import { normalizeAiCanvasRuntimeGrouping } from "./src/features/new-canvas/ai-canvas-runtime-adapter.js";

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
  stylesheet.href = "/ai-canvas-runtime/assets/runtime-brand-overrides.css?v=20260907-04";
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

function createAiCanvasRuntimeConfigBridge(store, theme) {
  if (!store?.getState || !store?.setState) {
    return { update() {}, dispose() {} };
  }
  let currentTheme = normalizeAiCanvasTheme(theme);
  const applyConfig = () => {
    const state = store.getState();
    const config = state?.config;
    if (!config || typeof config !== "object") return;
    const canvasBackground = currentTheme === "light" ? "off-white" : "default";
    if (config.theme === currentTheme && config.canvasBackground === canvasBackground) return;
    store.setState({
      config: {
        ...config,
        theme: currentTheme,
        canvasBackground,
      },
    });
  };
  applyConfig();
  const unsubscribe = store.subscribe?.((nextState, previousState) => {
    if (nextState?.config === previousState?.config) return;
    const expectedBackground = currentTheme === "light" ? "off-white" : "default";
    if (
      nextState?.config?.theme === currentTheme
      && nextState?.config?.canvasBackground === expectedBackground
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
        pricing: model?.pricing && typeof model.pricing === "object" ? sanitizeCatalogValue(model.pricing) : undefined,
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
      ? state.config.generalModels.filter((model) => model?.source !== "comic-ai-backend")
      : [];
    const providers = { ...(state?.config?.providers ?? {}) };
    if (modelCatalog.length && backendBaseUrl) {
      providers[backendProviderId] = { name: "Comic AI 后端", protocol: "backend", baseUrl: backendBaseUrl };
    }
    try {
      store.setState({
        config: {
          ...(state?.config ?? {}),
          providers,
          generalModels: [...modelCatalog, ...existingModels],
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
  return {
    id,
    name,
    title: name,
    createdAt,
    updatedAt,
    status: String(project?.status ?? "草稿"),
    externalCanvasProject: true,
  };
}

function normalizeAiCanvasRuntimeProjects(projects) {
  return (Array.isArray(projects) ? projects : [])
    .map(normalizeAiCanvasRuntimeProject)
    .filter(Boolean);
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

function normalizeAiCanvasRuntimeNode(node, index = 0) {
  if (!node || typeof node !== "object") return null;
  const type = inferAiCanvasRuntimeNodeType(node);
  const data = node.data && typeof node.data === "object" ? { ...node.data } : {};
  const size = node.size && typeof node.size === "object" ? node.size : {};
  const label = String(data.label ?? data.title ?? node.title ?? "").trim()
    || (type === "comment" ? "备注" : "生成节点");
  const status = data.status === "running" || data.status === "ready" || data.status === "empty"
    ? "idle"
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

function normalizeAiCanvasRuntimeDocument(document, canvasProjectId = "") {
  const source = document && typeof document === "object" ? document : {};
  const nodes = (Array.isArray(source.nodes) ? source.nodes : [])
    .map(normalizeAiCanvasRuntimeNode)
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
  let document = normalizeAiCanvasRuntimeDocument(
    context.document ?? context.canvasDocument,
    currentProjectId,
  );
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
  const applyHostProjectState = (next = {}) => {
    if (next.projectCatalog !== undefined) {
      projectCatalog = normalizeAiCanvasRuntimeProjects(next.projectCatalog);
    }
    if (next.currentProjectId !== undefined) {
      currentProjectId = String(next.currentProjectId ?? "").trim();
    }
    if (next.document !== undefined || next.canvasDocument !== undefined) {
      document = normalizeAiCanvasRuntimeDocument(
        next.document ?? next.canvasDocument,
        currentProjectId,
      );
    }
    const projects = projectCatalog;
    const currentProject = projects.find((project) => project.id === currentProjectId) ?? projects[0] ?? null;
    const patch = {
      ...(projects.length ? { projects } : {}),
      currentProjectId: currentProject?.id ?? currentProjectId ?? null,
      projectName: currentProject?.name ?? "",
      projectLoadStatus: "ready",
    };
    patch.nodes = Array.isArray(document.nodes) ? cloneValue(document.nodes) : [];
    patch.edges = Array.isArray(document.edges) ? cloneValue(document.edges) : [];
    patch.groups = Array.isArray(document.groups) ? cloneValue(document.groups) : [];
    store.setState(patch);
  };
  const readRuntimeDocument = () => {
    const state = store.getState();
    return {
      version: Number(document?.version ?? 1) || 1,
      ...(currentProjectId ? { canvasProjectId: currentProjectId } : {}),
      nodes: cloneValue(state.nodes ?? []),
      edges: cloneValue(state.edges ?? []),
      groups: cloneValue(state.groups ?? []),
    };
  };
  const saveThroughHost = async () => {
    const nextDocument = readRuntimeDocument();
    document = nextDocument;
    if (typeof context.onDocumentChange === "function") {
      await context.onDocumentChange(nextDocument);
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
      const projects = projectCatalog.map((project) => {
        const existing = existingProjects.find((item) => item?.id === project.id);
        const settings = project.settings ?? existing?.settings;
        return settings && typeof settings === "object"
          ? { ...project, settings }
          : project;
      });
      const currentProject = projects.find((project) => project.id === currentProjectId) ?? projects[0];
      const resolvedCurrentProjectId = currentProject?.id ?? currentProjectId ?? state.currentProjectId ?? null;
      const patch = {
        projects,
        currentProjectId: resolvedCurrentProjectId,
        projectName: currentProject?.name ?? state.projectName ?? "",
        switchingProjectName: null,
        ...(next.document !== undefined ? { projectLoadStatus: "ready" } : {}),
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

async function ensureAiCanvasRuntimeDefaultConversation(runtimeStore, context = {}) {
  const initialState = runtimeStore?.getState?.();
  // New Canvas always opens with the embedded assistant conversation view.
  // Clear a stale detached-window flag left by a previous runtime session.
  initialState?.setChatPanelDetached?.(false);
  initialState?.openChat?.();

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
  if (belongsToCurrentProject(activeConversation)) return;

  const firstProjectConversation = conversations.find(belongsToCurrentProject);
  if (firstProjectConversation?.id) {
    state?.setActiveConversation?.(firstProjectConversation.id);
    return;
  }

  state?.createConversation?.(settledProjectId);
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
      const stylesheetHref = "/ai-canvas-runtime/assets/runtime-brand-overrides.css?v=20260907-04";
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
        }
        .new-canvas-root .canvas-drawing-toolbar-wrap {
          position: relative !important;
          display: flex !important;
          align-items: center !important;
        }
        .new-canvas-root .canvas-note-style-panel-anchor {
          position: absolute !important;
          left: calc(6px + 40px + 6px + 5px + 6px + (var(--canvas-note-tool-index, 1) - 1) * 46px + 20px) !important;
          right: auto !important;
          bottom: calc(100% + 10px) !important;
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
        }
        .new-canvas-root .canvas-drawing-toolbar-wrap {
          position: relative !important;
          display: flex !important;
          align-items: center !important;
        }
        .new-canvas-root .canvas-note-style-panel-anchor {
          position: absolute !important;
          left: calc(6px + 40px + 6px + 5px + 6px + (var(--canvas-note-tool-index, 1) - 1) * 46px + 20px) !important;
          right: auto !important;
          bottom: calc(100% + 10px) !important;
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
      document: normalizeAiCanvasRuntimeDocument(
        context.document ?? context.canvasDocument,
        context.currentProjectId ?? context.canvasProjectId,
      ),
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
      onDocumentChange: (document) => context.syncDocument?.(document, { scheduleSave: true }),
    };
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
    const projectBridgePromise = createAiCanvasRuntimeProjectBridge({
        ...context,
        ...runtimeContext,
      });
    return projectBridgePromise.then((projectBridge) => mountAiCanvasRuntime(surface, runtimeContext).then(async (runtimeHandle) => {
      await ensureAiCanvasRuntimeDefaultConversation(runtimeStore, runtimeContext);
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
        return runtimeHandle?.update?.(next);
      },
      async dispose() {
        try {
          runtimeWindow?.removeEventListener?.("ai-canvas-open-project-task-center", onOpenProjectTaskCenter);
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
      runtimeWindow?.removeEventListener?.("ai-canvas-open-project-task-center", onOpenProjectTaskCenter);
      projectBridge.dispose();
      throw error;
    })).catch((error) => {
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
