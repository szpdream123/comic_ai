import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CloudDownload, TriangleAlert, UploadCloud } from "lucide-react";
import { renderCanvasProjectGallery } from "../../src/features/production-workbench/project-detail.js";
import { creatorApi } from "../../src/shared/creator-api.js";
const CanvasEditor = lazy(() => import("./loomic-core/CanvasEditor.jsx").then((module) => ({ default: module.CanvasEditor })));
import {
  archiveCanvasImageFile,
  LoomicCanvasShell,
  importMediaFilesToCanvas,
  persistBeforeCanvasNavigation,
} from "./loomic-shell/index.js";
import { buildCanvasAssistantRequest } from "./loomic-shell/canvas-assistant.js";
import { nextCanvasFilesDialogRequest } from "./loomic-shell/canvas-file-utils.js";
import {
  createCanvasProjectNameSync,
  initialCanvasProjectNameSaveState,
  mergeCanvasSaveStates,
  normalizeCanvasProjectName,
} from "./loomic-shell/project-name-sync.js";
import { useWorkbenchTheme, WorkbenchChrome, WorkbenchThemeProvider } from "./WorkbenchChrome.jsx";
import {
  createCloudCanvasStorage,
  isCloudCanvasProjectId,
} from "./loomic-core/canvas-document-adapter.js";
import { compactCanvasFilesForPersistence, hydrateCanvasContentForDisplay } from "./loomic-core/canvas-file-persistence.js";
import { projectCanvasConnectionsForView, restoreCanvasConnectionsForPersistence } from "./loomic-core/canvas-connection-visibility.js";
import { buildCanvasGenerationPayload, resumeCanvasGeneration, runCanvasGeneration } from "./loomic-core/canvas-generation.js";
import {
  applyCanvasGenerationMissingRecovery,
  applyCanvasGenerationServerTerminal,
  buildCanvasNodeGenerationRequest,
  canvasGenerationResultFromRun,
  collectCanvasGenerationResumeCandidates,
  collectCanvasGenerationServerRecoveryCandidates,
  executeCanvasNodeGeneration,
  findCanvasGenerationServerRecovery,
  markCanvasNodeGenerationInputStale,
  markCanvasNodeGenerationSubmitted,
} from "./loomic-core/canvas-generation-execution.js";
import { CanvasGenerationConfigProvider } from "./loomic-core/CanvasGenerationConfigContext.jsx";
import { createCanvasVersionHistoryStore } from "./loomic-core/canvas-version-history.js";
import { openSharedLoginModal } from "./shared-login.js";
import "./app.css";

const EMPTY_CONTENT = {
  elements: [],
  appState: {
    viewBackgroundColor: "#ffffff",
    gridModeEnabled: false,
  },
  files: {},
};

function navigateWorkbench(tab, fallbackPath, onNavigate) {
  if (typeof onNavigate === "function") {
    onNavigate(tab);
    return;
  }
  const embedded = new URLSearchParams(window.location.search).get("embedded") === "1";
  if (embedded && window.parent !== window) {
    window.parent.postMessage({ type: "comic-ai:navigate", tab }, window.location.origin);
    return;
  }
  window.location.href = fallbackPath;
}

function readStorage(key, fallback) {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // The canvas remains usable in private browsing; persistence is best effort.
  }
}

function writeStorageOrThrow(key, value) {
  window.localStorage.setItem(key, value);
}

function removeStorage(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore unavailable storage when resetting a local canvas.
  }
}

function normalizeCanvasProject(project, fallbackIndex = 0) {
  const id = String(project?.id ?? "").trim();
  if (!id) return null;
  return {
    ...project,
    id,
    title: String(project?.title ?? project?.name ?? `画布项目 ${fallbackIndex + 1}`).trim() || `画布项目 ${fallbackIndex + 1}`,
    createdAt: String(project?.createdAt ?? new Date().toLocaleDateString("zh-CN")),
    status: String(project?.status ?? "草稿"),
  };
}

function hasActiveSessionUser(session) {
  return session?.authenticated !== false && Boolean(session?.user?.id || session?.user?.phone);
}

function isUnauthenticatedError(error) {
  return Number(error?.status ?? 0) === 401 || String(error?.errorCode ?? error?.message ?? "") === "unauthenticated";
}

function openCanvasProject(projectId) {
  const normalized = String(projectId ?? "").trim();
  if (!normalized) return;
  window.location.href = `/new-canvas/?canvasProjectId=${encodeURIComponent(normalized)}`;
}

function NewCanvasProjectGallery() {
  const [projects, setProjects] = useState([]);
  const [session, setSession] = useState({ authenticated: false });
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [menuProjectId, setMenuProjectId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const requestRef = useRef(0);

  const loadProjects = useCallback(async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setStatus("loading");
    setError("");
    const sessionRequest = creatorApi.getSession({ fresh: true }).catch(() => null);
    try {
      const payload = await creatorApi.getCanvasProjects();
      const cloudProjects = (Array.isArray(payload?.projects) ? payload.projects : [])
        .map((project, index) => normalizeCanvasProject(project, index))
        .filter(Boolean);
      const nextSession = await sessionRequest;
      if (requestRef.current !== requestId) return;
      if (nextSession) setSession(nextSession);
      setProjects(cloudProjects);
      setStatus("ready");
    } catch (error) {
      const nextSession = await sessionRequest;
      if (requestRef.current !== requestId) return;
      if (nextSession) setSession(nextSession);
      setProjects([]);
      if (isUnauthenticatedError(error)) {
        setStatus("ready");
        return;
      }
      setStatus("error");
      setError("画布项目列表加载失败，请稍后重试。");
    }
  }, []);

  useEffect(() => {
    void loadProjects();
    return () => { requestRef.current += 1; };
  }, [loadProjects]);

  const createProject = useCallback(async () => {
    if (creating) return;
    if (!hasActiveSessionUser(session)) {
      await openSharedLoginModal();
      return;
    }
    setCreating(true);
    setError("");
    try {
      let project = null;
      const created = await creatorApi.createCanvasProject({
        title: `画布项目 ${projects.length + 1}`,
        status: "draft",
      });
      project = normalizeCanvasProject(created?.project, projects.length);
      if (!project) throw new Error("canvas_project_create_failed");
      setProjects((current) => {
        return current.some((candidate) => candidate.id === project.id) ? current : [...current, project];
      });
      setStatus("ready");
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        await openSharedLoginModal();
      } else {
        setError("画布创建失败，请稍后重试。");
      }
    } finally {
      setCreating(false);
    }
  }, [creating, projects.length, session]);

  const renameProject = useCallback(async (projectId) => {
    const project = projects.find((candidate) => candidate.id === projectId);
    if (!project) return;
    const title = window.prompt("重命名画布", project.title)?.trim().slice(0, 50);
    if (!title || title === project.title) return;
    try {
      if (isCloudCanvasProjectId(projectId)) {
        await creatorApi.updateCanvasProject(projectId, { title, expectedTitle: project.title });
      }
      setProjects((current) => {
        return current.map((candidate) => candidate.id === projectId ? { ...candidate, title } : candidate);
      });
      setMenuProjectId("");
    } catch {
      setError("画布重命名失败，请稍后重试。");
    }
  }, [projects]);

  const deleteProject = useCallback(async (projectId) => {
    const project = projects.find((candidate) => candidate.id === projectId);
    if (!project || !window.confirm(`确定删除“${project.title}”吗？`)) return;
    try {
      if (isCloudCanvasProjectId(projectId)) {
        await creatorApi.deleteCanvasProject(projectId);
      }
      setProjects((current) => {
        return current.filter((candidate) => candidate.id !== projectId);
      });
      setMenuProjectId("");
    } catch {
      setError("画布删除失败，请稍后重试。");
    }
  }, [projects]);

  const visibleProjects = useMemo(() => {
    const keyword = searchQuery.trim().toLocaleLowerCase();
    return keyword ? projects.filter((project) => project.title.toLocaleLowerCase().includes(keyword)) : projects;
  }, [projects, searchQuery]);
  const gallery = useMemo(() => renderCanvasProjectGallery({
    canvasProjects: visibleProjects,
    canvasProjectMenuId: menuProjectId,
    canvasProjectSearchQuery: searchQuery,
    session,
  }), [menuProjectId, searchQuery, session, visibleProjects]);

  const handleGalleryClick = (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    const projectId = String(target.dataset.canvasProjectId ?? "").trim();
    if (action === "create-canvas-project") void createProject();
    if (action === "open-canvas-project") openCanvasProject(projectId);
    if (action === "toggle-canvas-project-menu") {
      setMenuProjectId((current) => current === projectId ? "" : projectId);
    }
    if (action === "rename-canvas-project") void renameProject(projectId);
    if (action === "delete-canvas-project") void deleteProject(projectId);
  };

  const handleGalleryChange = (event) => {
    if (event.target.matches?.(".canvas-project-search input")) {
      setSearchQuery(event.target.value);
    }
  };

  return (
    <main
      className={`lm-canvas-page lm-canvas-project-list${creating ? " is-creating" : ""}`}
      aria-busy={status === "loading" || creating}
      onClick={handleGalleryClick}
      onChange={handleGalleryChange}
    >
      <div dangerouslySetInnerHTML={{ __html: gallery }} />
      {status === "loading" && projects.length === 0 ? <p className="lm-canvas-project-state" role="status">正在加载画布...</p> : null}
      {error ? <button className="lm-canvas-project-state is-error" type="button" onClick={loadProjects}>{error}</button> : null}
    </main>
  );
}

function createLocalCanvasStore(storageKey) {
  const databaseName = "comic-ai-loomic-canvas";
  const storeName = "documents";
  const openDatabase = () => new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error("indexedDB unavailable")); return; }
    const request = window.indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("indexedDB open failed"));
  });
  return {
    async load() {
      try {
        const db = await openDatabase();
        return await new Promise((resolve, reject) => {
          const request = db.transaction(storeName, "readonly").objectStore(storeName).get(storageKey);
          request.onsuccess = () => {
            if (request.result) { resolve(request.result); return; }
            try { resolve(JSON.parse(readStorage(storageKey, "null"))); } catch { resolve(null); }
          };
          request.onerror = () => reject(request.error || new Error("indexedDB read failed"));
        });
      } catch {
        try { return JSON.parse(readStorage(storageKey, "null")); } catch { return null; }
      }
    },
    async save(content) {
      try {
        const db = await openDatabase();
        await new Promise((resolve, reject) => {
          const request = db.transaction(storeName, "readwrite").objectStore(storeName).put(content, storageKey);
          request.onsuccess = resolve;
          request.onerror = () => reject(request.error || new Error("indexedDB write failed"));
        });
        removeStorage(storageKey);
      } catch {
        writeStorageOrThrow(storageKey, JSON.stringify(content));
      }
    },
    async remove() {
      try {
        const db = await openDatabase();
        await new Promise((resolve, reject) => {
          const request = db.transaction(storeName, "readwrite").objectStore(storeName).delete(storageKey);
          request.onsuccess = resolve;
          request.onerror = () => reject(request.error || new Error("indexedDB delete failed"));
        });
        removeStorage(storageKey);
      } catch {
        removeStorage(storageKey);
      }
    },
  };
}

function createLifecycleCanvasStore(storageKey) {
  return {
    load() {
      try { return JSON.parse(window.localStorage.getItem(storageKey) || "null"); } catch { return null; }
    },
    save(value) {
      try { window.localStorage.setItem(storageKey, JSON.stringify(value)); return true; } catch { return false; }
    },
    remove() {
      try { window.localStorage.removeItem(storageKey); } catch { /* Best-effort close recovery. */ }
    },
  };
}

function applyContentToCanvasApi(api, content) {
  if (!api || !content || typeof api.updateScene !== "function") throw new Error("canvas_content_projection_unavailable");
  const hydratedContent = hydrateCanvasContentForDisplay(content);
  const files = Object.values(hydratedContent.files ?? {}).filter((file) => file && file.id);
  if (files.length && typeof api.addFiles !== "function") throw new Error("canvas_file_projection_unavailable");
  if (files.length) api.addFiles(files);
  api.updateScene({
    elements: projectCanvasConnectionsForView(api, hydratedContent.elements ?? [], { rebase: true }),
    appState: hydratedContent.appState ?? {},
    captureUpdate: "NONE",
  });
  return hydratedContent;
}

function applyVersionContentToCanvasApi(api, content) {
  if (!api || !content) return null;
  const hydratedContent = hydrateCanvasContentForDisplay(content);
  const files = Object.values(hydratedContent.files ?? {}).filter((file) => file && file.id);
  if (files.length) api.addFiles?.(files);
  api.updateScene?.({
    elements: projectCanvasConnectionsForView(api, hydratedContent.elements ?? [], { rebase: true }),
    appState: { ...(hydratedContent.appState ?? {}), selectedElementIds: {} },
    captureUpdate: "IMMEDIATELY",
  });
  return hydratedContent;
}

function snapshotCanvasContent(api) {
  const appState = api?.getAppState?.() ?? {};
  const elements = restoreCanvasConnectionsForPersistence(api, api?.getSceneElements?.() ?? [])
    .filter((element) => !element.isDeleted);
  const files = compactCanvasFilesForPersistence(elements, api?.getFiles?.() ?? {});
  return {
    elements,
    appState: {
      viewBackgroundColor: appState.viewBackgroundColor,
      gridModeEnabled: appState.gridModeEnabled,
      theme: appState.theme,
      scrollX: appState.scrollX,
      scrollY: appState.scrollY,
      zoom: appState.zoom,
    },
    files,
  };
}

function NewCanvasPage({ canvasProjectId = "", embedded = false, onNavigate }) {
  const selectedWorkbenchTheme = useWorkbenchTheme();
  const canvasColorScheme = selectedWorkbenchTheme === "daylight" ? "light" : "dark";
  const canvasContext = useMemo(() => {
    const query = new URLSearchParams(window.location.search);
    const id = String(canvasProjectId || query.get("canvasProjectId") || "standalone").trim() || "standalone";
    const scopedSuffix = id.replace(/[^a-zA-Z0-9:_-]+/g, "-");
    return {
      canvasProjectId: id,
      canvasId: `lingxi-new-canvas-${scopedSuffix}`,
      storageKey: `comic-ai:loomic-canvas:v1:${scopedSuffix}`,
      historyStorageKey: `comic-ai:loomic-canvas:history:v1:${scopedSuffix}`,
      chatStorageKey: `comic-ai:loomic-canvas:chat:v1:${scopedSuffix}`,
      projectNameKey: `comic-ai:loomic-canvas:name:${scopedSuffix}`,
      projectNamePendingKey: `comic-ai:loomic-canvas:name-pending:${scopedSuffix}`,
    };
  }, [canvasProjectId]);
  const [api, setApi] = useState(null);
  const apiRef = useRef(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const [cloudCanvasProjectId, setCloudCanvasProjectId] = useState("");
  const [projectName, setProjectName] = useState(
    () => readStorage(canvasContext.projectNamePendingKey, "") || readStorage(canvasContext.projectNameKey, "未命名创意画布"),
  );
  const [projectNameSaveState, setProjectNameSaveState] = useState(() => initialCanvasProjectNameSaveState(
    readStorage(canvasContext.projectNamePendingKey, ""),
  ));
  const [projectNameConflict, setProjectNameConflict] = useState(null);
  const [projectNameConflictAction, setProjectNameConflictAction] = useState("");
  const projectNameServerTitleRef = useRef("");
  const [chatOpen, setChatOpen] = useState(() => window.innerWidth >= 1024);
  const [viewMode, setViewMode] = useState("workflow");
  const [filesOpen, setFilesOpen] = useState(false);
  const [filesDialogRequest, setFilesDialogRequest] = useState(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedElements, setSelectedElements] = useState([]);
  const [saveState, setSaveState] = useState("loading");
  const [saveConflict, setSaveConflict] = useState(null);
  const [conflictAction, setConflictAction] = useState("");
  const [conflictError, setConflictError] = useState("");
  const [canvasProjects, setCanvasProjects] = useState([]);
  const [canvasProjectsStatus, setCanvasProjectsStatus] = useState("loading");
  const [canvasProjectsError, setCanvasProjectsError] = useState("");
  const canvasProjectsRequestRef = useRef(0);
  const resumedGenerationKeysRef = useRef(new Set());
  const serverRecoveryKeysRef = useRef(new Set());
  const projectNameSync = useMemo(() => createCanvasProjectNameSync({
    initialPendingTitle: readStorage(canvasContext.projectNamePendingKey, ""),
    save: async (title) => {
      if (!isCloudCanvasProjectId(canvasContext.canvasProjectId)) return;
      try {
        const payload = await creatorApi.updateCanvasProject(canvasContext.canvasProjectId, {
          title,
          ...(projectNameServerTitleRef.current ? { expectedTitle: projectNameServerTitleRef.current } : {}),
        });
        projectNameServerTitleRef.current = String(payload?.project?.title ?? title);
      } catch (error) {
        if (error?.errorCode === "canvas_project_title_conflict") {
          const serverTitle = normalizeCanvasProjectName(error?.details?.currentTitle);
          projectNameServerTitleRef.current = serverTitle;
          setProjectNameConflict({ localTitle: title, serverTitle });
        }
        throw error;
      }
    },
    onPendingChange: (title) => {
      if (title) writeStorage(canvasContext.projectNamePendingKey, title);
      else removeStorage(canvasContext.projectNamePendingKey);
    },
    onStateChange: setProjectNameSaveState,
  }), [canvasContext.canvasProjectId, canvasContext.projectNamePendingKey]);
  const versionHistory = useMemo(() => createCanvasVersionHistoryStore({
    store: createLocalCanvasStore(canvasContext.historyStorageKey),
  }), [canvasContext.historyStorageKey]);
  const canvasStorage = useMemo(() => createCloudCanvasStorage({
    localStore: createLocalCanvasStore(canvasContext.storageKey),
    conflictStore: createLocalCanvasStore(`${canvasContext.storageKey}:conflict`),
    lifecycleStore: createLifecycleCanvasStore(`${canvasContext.storageKey}:pending-close`),
    syncStateStore: createLocalCanvasStore(`${canvasContext.storageKey}:sync-state`),
    creatorApi,
    canvasProjectId: canvasContext.canvasProjectId,
    historyStore: versionHistory,
    onConflict: (serverContent) => {
      setSaveConflict({ serverContent });
      setConflictError("");
    },
  }), [canvasContext.canvasProjectId, canvasContext.storageKey, versionHistory]);

  useEffect(() => {
    let active = true;
    canvasStorage.initialize()
      .then(() => {
        if (!active) return;
        setSaveState(canvasStorage.getInitialSaveState?.() ?? "saved");
        setCloudCanvasProjectId(String(canvasStorage.getCloudCanvas?.()?.canvasProjectId ?? "").trim());
      })
      .catch(() => { if (active) setSaveState("error"); })
      .finally(() => { if (active) setCanvasReady(true); });
    return () => { active = false; };
  }, [canvasStorage]);

  const loadCanvasProjects = useCallback(async () => {
    const requestId = canvasProjectsRequestRef.current + 1;
    canvasProjectsRequestRef.current = requestId;
    setCanvasProjectsStatus("loading");
    setCanvasProjectsError("");
    try {
      const payload = await creatorApi.getCanvasProjects();
      const projects = (Array.isArray(payload?.projects) ? payload.projects : [])
        .map((project, index) => normalizeCanvasProject(project, index))
        .filter(Boolean);
      if (canvasProjectsRequestRef.current !== requestId) return;
      setCanvasProjects(projects);
      setCanvasProjectsStatus("ready");
      const currentProject = projects.find((project) => project.id === canvasContext.canvasProjectId);
      if (currentProject?.title) projectNameServerTitleRef.current = currentProject.title;
      if (currentProject?.title && !projectNameSync.pendingTitle()) {
        setProjectName(currentProject.title);
        writeStorage(canvasContext.projectNameKey, currentProject.title);
      }
    } catch (error) {
      if (canvasProjectsRequestRef.current !== requestId) return;
      if (isUnauthenticatedError(error)) {
        setCanvasProjects([]);
        setCanvasProjectsStatus("ready");
        await openSharedLoginModal();
        return;
      }
      setCanvasProjects([]);
      setCanvasProjectsStatus("error");
      setCanvasProjectsError("画布列表加载失败");
    }
  }, [canvasContext.canvasProjectId, canvasContext.projectNameKey, projectNameSync]);

  useEffect(() => {
    void loadCanvasProjects();
    return () => { canvasProjectsRequestRef.current += 1; };
  }, [loadCanvasProjects]);

  const handleApiReady = useCallback((nextApi) => {
    apiRef.current = nextApi;
    setApi(nextApi);
  }, []);

  useEffect(() => () => {
    apiRef.current = null;
  }, []);

  const updateProjectName = useCallback((nextName) => {
    const normalized = normalizeCanvasProjectName(nextName);
    setProjectName(normalized);
    setProjectNameConflict((current) => current ? { ...current, localTitle: normalized } : current);
    writeStorage(canvasContext.projectNameKey, normalized);
    setCanvasProjects((projects) => {
      return projects.map((project) =>
        project.id === canvasContext.canvasProjectId ? { ...project, title: normalized } : project,
      );
    });
    if (isCloudCanvasProjectId(canvasContext.canvasProjectId)) {
      void projectNameSync.schedule(normalized).catch((error) => {
        if (isUnauthenticatedError(error)) void openSharedLoginModal();
        apiRef.current?.setToast?.({ message: "项目名称尚未同步，恢复网络后可重试。", closable: true });
      });
    }
  }, [canvasContext.canvasProjectId, canvasContext.projectNameKey, projectNameSync]);

  const retryProjectNameSave = useCallback(async () => {
    if (!projectNameSync.pendingTitle()) return;
    if (isCloudCanvasProjectId(canvasContext.canvasProjectId) && !projectNameServerTitleRef.current) return;
    setProjectNameSaveState("retrying");
    try {
      await projectNameSync.flush();
    } catch (error) {
      if (isUnauthenticatedError(error)) await openSharedLoginModal();
      apiRef.current?.setToast?.({ message: "项目名称同步失败，请稍后重试。", closable: true });
    }
  }, [canvasContext.canvasProjectId, projectNameSync]);

  const resolveProjectNameConflict = useCallback(async (strategy) => {
    if (!projectNameConflict || projectNameConflictAction) return;
    setProjectNameConflictAction(strategy);
    try {
      if (strategy === "server") {
        projectNameSync.discard();
        setProjectName(projectNameConflict.serverTitle);
        writeStorage(canvasContext.projectNameKey, projectNameConflict.serverTitle);
        setCanvasProjects((projects) => projects.map((project) => project.id === canvasContext.canvasProjectId
          ? { ...project, title: projectNameConflict.serverTitle }
          : project));
      } else {
        await projectNameSync.retryConflict();
      }
      setProjectNameConflict(null);
    } catch (error) {
      if (isUnauthenticatedError(error)) await openSharedLoginModal();
      apiRef.current?.setToast?.({ message: "标题冲突处理失败，请重试。", closable: true });
    } finally {
      setProjectNameConflictAction("");
    }
  }, [canvasContext.canvasProjectId, canvasContext.projectNameKey, projectNameConflict, projectNameConflictAction, projectNameSync]);

  useEffect(() => {
    if (canvasProjectsStatus !== "ready") return undefined;
    if (projectNameSync.pendingTitle()) void retryProjectNameSave();
    const retryOnline = () => { void retryProjectNameSave(); };
    const flushRequestedSave = () => { void retryProjectNameSave(); };
    window.addEventListener("online", retryOnline);
    window.addEventListener("loomic-canvas:save-request", flushRequestedSave);
    return () => {
      window.removeEventListener("online", retryOnline);
      window.removeEventListener("loomic-canvas:save-request", flushRequestedSave);
    };
  }, [canvasProjectsStatus, projectNameSync, retryProjectNameSave]);

  const resetCanvas = useCallback(async () => {
    await canvasStorage.remove?.();
    removeStorage(canvasContext.chatStorageKey);
    api?.resetScene?.();
  }, [api, canvasContext.chatStorageKey, canvasStorage]);

  const persistCurrentSceneForNavigation = useCallback(async () => {
    const canvasApi = apiRef.current;
    if (!canvasApi || !canvasReady) {
      const error = new Error("画布尚未准备完成，请稍后再切换。");
      error.code = "canvas_navigation_not_ready";
      setSaveState("error");
      throw error;
    }
    let result;
    try {
      try {
        await projectNameSync.flush();
      } catch (error) {
        const navigationError = new Error("项目名称尚未同步，请重试后再切换。", { cause: error });
        navigationError.code = "canvas_project_name_save_failed";
        throw navigationError;
      }
      result = await persistBeforeCanvasNavigation({
        storage: canvasStorage,
        canvasId: canvasContext.canvasId,
        content: snapshotCanvasContent(canvasApi),
      });
    } catch (error) {
      if (error?.code === "canvas_project_name_save_failed") setProjectNameSaveState("error");
      else setSaveState(error?.code === "canvas_navigation_conflict" ? "conflict" : "error");
      throw error;
    }
    setSaveState(result?.source === "local" ? "local" : "saved");
    return result;
  }, [canvasContext.canvasId, canvasReady, canvasStorage, projectNameSync]);

  const selectCanvasProject = useCallback(async (projectId, options = {}) => {
    const normalized = String(projectId ?? "").trim();
    if (!normalized || normalized === canvasContext.canvasProjectId) return;
    try {
      if (!options.skipPersist) await persistCurrentSceneForNavigation();
      const query = new URLSearchParams(window.location.search);
      query.set("canvasProjectId", normalized);
      query.delete("projectId");
      query.delete("episodeId");
      query.delete("canvasId");
      window.location.href = `/new-canvas/?${query.toString()}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存当前画布失败，已取消切换。";
      setCanvasProjectsError(message);
      apiRef.current?.setToast?.({ message, closable: true });
    }
  }, [canvasContext.canvasProjectId, persistCurrentSceneForNavigation]);

  const createNewProject = useCallback(async () => {
    try {
      await persistCurrentSceneForNavigation();
      const activeSession = await creatorApi.getSession({ fresh: true });
      if (!hasActiveSessionUser(activeSession)) {
        await openSharedLoginModal();
        return;
      }
      const created = await creatorApi.createCanvasProject({ title: "未命名创意画布", status: "draft" });
      const project = normalizeCanvasProject(created?.project, canvasProjects.length);
      if (!project) throw new Error("canvas_project_create_failed");
      setCanvasProjects((projects) => [...projects, project]);
      await selectCanvasProject(project.id, { skipPersist: true });
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        await openSharedLoginModal();
      } else {
        setCanvasProjectsStatus("error");
        setCanvasProjectsError("画布创建失败");
      }
    }
  }, [canvasProjects, persistCurrentSceneForNavigation, selectCanvasProject]);

  const deleteProject = useCallback(async () => {
    try {
      if (isCloudCanvasProjectId(canvasContext.canvasProjectId)) {
        await creatorApi.deleteCanvasProject(canvasContext.canvasProjectId);
      }
      await resetCanvas();
      removeStorage(canvasContext.projectNameKey);
      const projects = canvasProjects.filter((project) => project.id !== canvasContext.canvasProjectId);
      setCanvasProjects(projects);
      const nextProject = projects[0];
      if (nextProject) {
        await selectCanvasProject(nextProject.id, { skipPersist: true });
        return;
      }
      window.location.href = "/new-canvas/";
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        await openSharedLoginModal();
      } else {
        setCanvasProjectsStatus("error");
        setCanvasProjectsError("画布删除失败");
      }
    }
  }, [canvasContext.canvasProjectId, canvasContext.projectNameKey, canvasProjects, resetCanvas, selectCanvasProject]);

  const persistSubmittedGeneration = useCallback(async (canvasApi, request, taskId) => {
    if (!markCanvasNodeGenerationSubmitted(canvasApi, request, taskId)) {
      markCanvasNodeGenerationInputStale(canvasApi, request, taskId);
      return;
    }
    try {
      const result = await canvasStorage.save(canvasContext.canvasId, snapshotCanvasContent(canvasApi));
      if (result?.status === "conflict") setSaveState("conflict");
      else setSaveState(result?.source === "local" ? "local" : "saved");
    } catch (error) {
      console.error("[loomic-canvas] submitted generation could not be persisted", error);
      setSaveState("error");
    }
  }, [canvasContext.canvasId, canvasStorage]);

  const generateOnCanvas = useCallback(async (request, execution = {}) => {
    const canvasApi = apiRef.current;
    const appState = canvasApi?.getAppState?.() ?? {};
    const selectedIds = appState.selectedElementIds ?? {};
    const nodeKey = String(request?.elementId ?? Object.keys(selectedIds).find((id) => selectedIds[id]) ?? "");
    if (!canvasApi || !nodeKey) {
      throw new Error("请先选择一个生成节点。");
    }
    const generationSnapshot = snapshotCanvasContent(canvasApi);
    const saveResult = await canvasStorage.save(canvasContext.canvasId, generationSnapshot).catch(async (error) => {
      if (isUnauthenticatedError(error)) await openSharedLoginModal();
      throw error;
    });
    if (saveResult?.status === "conflict") {
      setSaveState("conflict");
      throw new Error("云端版本已更新，请先处理保存冲突后再生成。");
    }
    const cloudCanvas = canvasStorage.getCloudCanvas?.();
    const canvasProjectId = String(cloudCanvas?.canvasProjectId ?? "").trim();
    setCloudCanvasProjectId(canvasProjectId);
    let persistedTaskId = "";
    return runCanvasGeneration({
      api: creatorApi,
      kind: request?.type === "director-node"
        ? "director"
        : request?.type === "video-generator"
          ? "video"
          : request?.type === "audio-node" ? "audio" : "image",
      nodeId: nodeKey,
      data: request ?? {},
      elements: generationSnapshot.elements,
      files: generationSnapshot.files,
      canvasProjectId: canvasProjectId || undefined,
      onProgress: async ({ taskId }) => {
        if (!taskId || taskId === persistedTaskId) return;
        persistedTaskId = taskId;
        await persistSubmittedGeneration(canvasApi, { ...request, elementId: nodeKey }, taskId);
      },
      signal: execution.signal,
    }).catch(async (error) => {
      if (isUnauthenticatedError(error)) await openSharedLoginModal();
      throw error;
    });
  }, [canvasContext.canvasId, canvasStorage, persistSubmittedGeneration]);

  const composeVideoOnCanvas = useCallback((payload, options = {}) => {
    return creatorApi.createNewCanvasVideoComposition(payload, options).catch(async (error) => {
      if (isUnauthenticatedError(error)) await openSharedLoginModal();
      throw error;
    });
  }, []);

  const cancelGenerationOnCanvas = useCallback((taskId) => {
    return creatorApi.cancelGenerationTask(taskId).catch(async (error) => {
      if (isUnauthenticatedError(error)) await openSharedLoginModal();
      throw error;
    });
  }, []);

  useEffect(() => {
    if (!api || !canvasReady || !cloudCanvasProjectId) return undefined;
    const candidates = collectCanvasGenerationServerRecoveryCandidates(api.getSceneElements?.() ?? []);
    if (!candidates.length) return undefined;
    let active = true;
    Promise.allSettled(candidates.map(async (element) => ({
      elementId: element.id,
      history: await creatorApi.listCanvasNodeRuns(cloudCanvasProjectId, element.id),
    }))).then((results) => {
      if (!active) return;
      const entries = results.flatMap((result) => {
        if (result.status === "fulfilled") return [result.value];
        if (isUnauthenticatedError(result.reason)) void openSharedLoginModal();
        return [];
      });
      for (const entry of entries) {
        const elements = api.getSceneElements?.() ?? [];
        const element = elements.find((item) => item.id === entry.elementId && !item.isDeleted);
        const request = buildCanvasNodeGenerationRequest(element);
        if (!element || !request) continue;
        const kind = request.type === "video-generator" ? "video" : request.type === "audio-node" ? "audio" : "image";
        const payload = buildCanvasGenerationPayload({
          kind,
          nodeId: element.id,
          data: request,
          elements,
          files: api.getFiles?.() ?? {},
          canvasProjectId: cloudCanvasProjectId,
        });
        const recovery = findCanvasGenerationServerRecovery(element, entry.history, payload);
        if (!recovery) {
          applyCanvasGenerationMissingRecovery(api, element);
          continue;
        }
        const recoveryKey = `${cloudCanvasProjectId}:${element.id}:${recovery.run?.id ?? ""}:${recovery.taskId}`;
        if (serverRecoveryKeysRef.current.has(recoveryKey)) continue;
        serverRecoveryKeysRef.current.add(recoveryKey);
        if (recovery.action === "terminal") {
          applyCanvasGenerationServerTerminal(api, element, recovery);
          continue;
        }
        void (async () => {
          if (recovery.taskId) await persistSubmittedGeneration(api, request, recovery.taskId);
          const storedResult = recovery.action === "complete" ? canvasGenerationResultFromRun(recovery.run) : null;
          await executeCanvasNodeGeneration({
            api,
            request,
            onGenerate: () => storedResult?.artifacts?.length
              ? Promise.resolve(storedResult)
              : resumeCanvasGeneration({ api: creatorApi, kind, taskId: recovery.taskId }),
          });
        })().catch((error) => {
          const authenticationRequired = isUnauthenticatedError(error);
          if (authenticationRequired) void openSharedLoginModal();
          api.setToast?.({
            message: authenticationRequired
              ? "登录后将继续恢复该生成任务。"
              : error instanceof Error ? error.message : "生成任务恢复失败。",
            closable: true,
          });
        });
      }
    });
    return () => { active = false; };
  }, [api, canvasReady, cloudCanvasProjectId, persistSubmittedGeneration]);

  useEffect(() => {
    if (!api || !canvasReady) return;
    const runningNodes = collectCanvasGenerationResumeCandidates(api.getSceneElements?.() ?? []);
    for (const element of runningNodes) {
      const taskId = String(element.customData.taskId).trim();
      const resumeKey = `${element.id}:${taskId}`;
      if (!taskId || resumedGenerationKeysRef.current.has(resumeKey)) continue;
      const request = buildCanvasNodeGenerationRequest(element);
      if (!request) continue;
      resumedGenerationKeysRef.current.add(resumeKey);
      void executeCanvasNodeGeneration({
        api,
        request,
        onGenerate: () => resumeCanvasGeneration({
          api: creatorApi,
          kind: request.type === "video-generator" ? "video" : request.type === "audio-node" ? "audio" : "image",
          taskId,
        }),
      }).catch((error) => {
        const authenticationRequired = isUnauthenticatedError(error);
        if (authenticationRequired) void openSharedLoginModal();
        api.setToast?.({
          message: authenticationRequired
            ? "登录后将继续恢复该生成任务。"
            : error instanceof Error ? error.message : "生成任务恢复失败。",
          closable: true,
        });
      });
    }
  }, [api, canvasReady]);

  const importCanvasImage = useCallback((file, canvasApi, options = {}) => {
    const callerScope = typeof options.shouldInsert === "function" ? options.shouldInsert : () => true;
    const shouldInsert = () => apiRef.current === canvasApi && callerScope();
    return importMediaFilesToCanvas(canvasApi, [file], {
      assetClient: creatorApi,
      imagePurpose: "new-canvas/image-import",
      videoPurpose: "new-canvas/video-import",
      audioPurpose: "new-canvas/audio-import",
      shouldInsert,
      ...(options.anchor ? { anchor: options.anchor } : {}),
    });
  }, []);
  const archiveNativeCanvasImage = useCallback((file, options = {}) => archiveCanvasImageFile(file, {
    assetClient: creatorApi,
    purpose: "new-canvas/native-image-import",
    ...(options.purpose ? { purpose: options.purpose } : {}),
  }), []);
  const checkCanvasUploadSession = useCallback((uploadSessionId) => creatorApi.getUploadSession(uploadSessionId), []);

  const sendCanvasAssistantMessage = useCallback(async (message, context) => {
    const payload = await creatorApi.sendNewCanvasAssistantMessage(buildCanvasAssistantRequest(message, context));
    return payload?.message;
  }, []);

  const restoreCanvasVersion = useCallback(async (versionId) => {
    const canvasApi = apiRef.current;
    if (!canvasApi) throw new Error("画布尚未准备完成。");
    const entry = await canvasStorage.getHistoryEntry?.(versionId);
    if (!entry?.content) throw new Error("该版本已不存在。");
    const currentContent = snapshotCanvasContent(canvasApi);
    const saveResult = await canvasStorage.save(canvasContext.canvasId, currentContent);
    if (saveResult?.status === "conflict") throw new Error("云端版本已变化，请重新选择要恢复的版本。");
    try {
      const restoredContent = applyVersionContentToCanvasApi(canvasApi, entry.content);
      const restoreResult = await canvasStorage.save(canvasContext.canvasId, restoredContent);
      if (restoreResult?.status === "conflict") throw new Error("恢复期间云端版本已变化，请重新选择要恢复的版本。");
      setSaveState(restoreResult?.source === "local" ? "local" : "saved");
      return entry;
    } catch (error) {
      try {
        applyVersionContentToCanvasApi(canvasApi, currentContent);
        await canvasStorage.save(canvasContext.canvasId, currentContent);
      } catch (rollbackError) {
        console.error("[loomic-canvas] version restore rollback failed", rollbackError);
        throw new Error("版本恢复失败，且当前画布未能自动回滚，请刷新后检查版本。", { cause: error });
      }
      throw error;
    }
  }, [canvasContext.canvasId, canvasStorage]);

  const resolveSaveConflict = useCallback(async (strategy) => {
    if (!saveConflict || conflictAction) return;
    const canvasApi = apiRef.current;
    if (!canvasApi) return;
    setConflictAction(strategy);
    setConflictError("");
    try {
      const result = strategy === "server"
        ? await canvasStorage.resolveConflict?.("server", {
          beforeCommit: (content) => applyContentToCanvasApi(canvasApi, content),
        })
        : await canvasStorage.resolveConflict?.("local", snapshotCanvasContent(canvasApi));
      if (result?.status === "conflict") {
        setSaveState("conflict");
        setConflictError("保存期间云端再次更新，请重新选择处理方式。");
        return;
      }
      setSaveConflict(null);
      setSaveState(result?.source === "local" ? "local" : "saved");
    } catch (error) {
      console.error("[loomic-canvas] conflict resolution failed", error);
      setSaveState("conflict");
      setConflictError("冲突处理失败，本地内容仍已保留，请重试。");
    } finally {
      setConflictAction("");
    }
  }, [canvasStorage, conflictAction, saveConflict]);

  const changeViewMode = useCallback((nextMode) => {
    const normalizedMode = nextMode === "storyboard" ? "storyboard" : "workflow";
    setViewMode(normalizedMode);
    if (normalizedMode === "storyboard") {
      apiRef.current?.updateScene?.({ appState: { selectedElementIds: {} }, captureUpdate: "NONE" });
      setSelectedElements([]);
    }
    setFilesOpen(false);
    setFilesDialogRequest(null);
    setLayersOpen(false);
    setHistoryOpen(false);
  }, []);
  const openFilesView = useCallback((view) => {
    setFilesOpen(false);
    setLayersOpen(false);
    setHistoryOpen(false);
    setFilesDialogRequest((current) => nextCanvasFilesDialogRequest(current, view));
  }, []);

  const canvasSlot = (
    <Suspense fallback={<div className="loomic-canvas-loading" role="status">正在加载画布编辑器…</div>}>
      <CanvasEditor
        canvasId={canvasContext.canvasId}
        initialContent={EMPTY_CONTENT}
        storage={canvasStorage}
        storageKey={canvasContext.storageKey}
        theme={canvasColorScheme}
        filesOpen={filesOpen}
        layersOpen={layersOpen}
        leftPanelOpen={filesOpen || layersOpen || historyOpen}
        onToggleLayers={() => { setFilesDialogRequest(null); setFilesOpen(false); setHistoryOpen(false); setLayersOpen((open) => !open); }}
        onToggleFiles={() => { setFilesDialogRequest(null); setLayersOpen(false); setHistoryOpen(false); setFilesOpen((open) => !open); }}
        onOpenFilesView={openFilesView}
        viewMode={viewMode}
        onApiReady={handleApiReady}
        onSelectionChange={setSelectedElements}
        onSaveStateChange={setSaveState}
        onGenerate={generateOnCanvas}
        onCancelGeneration={cancelGenerationOnCanvas}
        onCompose={composeVideoOnCanvas}
        canvasProjectId={cloudCanvasProjectId}
        onArchiveImage={archiveNativeCanvasImage}
        onCheckUploadSession={checkCanvasUploadSession}
        onImportImage={importCanvasImage}
      />
    </Suspense>
  );

  return (
    <WorkbenchChrome view="detail" embedded={embedded}>
      <div className="lm-canvas-page">
        <CanvasGenerationConfigProvider api={creatorApi}>
          <LoomicCanvasShell
            canvasSlot={canvasSlot}
            api={api}
            assetClient={creatorApi}
            canvasProjectId={cloudCanvasProjectId}
            saveState={mergeCanvasSaveStates(saveState, projectNameSaveState)}
            onRetrySave={projectNameSaveState === "error" && saveState !== "conflict" ? retryProjectNameSave : undefined}
            onGenerate={generateOnCanvas}
            projectName={projectName}
            onProjectNameChange={updateProjectName}
            viewMode={viewMode}
            onViewModeChange={changeViewMode}
            chatOpen={chatOpen}
            onChatOpenChange={setChatOpen}
            layersOpen={layersOpen}
            filesOpen={filesOpen}
            onFilesOpenChange={(open) => { setFilesDialogRequest(null); setLayersOpen(false); setHistoryOpen(false); setFilesOpen(open); }}
            filesDialogRequest={filesDialogRequest}
            onFilesDialogClose={() => setFilesDialogRequest(null)}
            historyOpen={historyOpen}
            onHistoryOpenChange={(open) => { setFilesOpen(false); setLayersOpen(false); setHistoryOpen(open); }}
            versionHistory={canvasStorage}
            onRestoreVersion={restoreCanvasVersion}
            selectedElements={selectedElements}
            chatStorageKey={canvasContext.chatStorageKey}
            onChatSend={sendCanvasAssistantMessage}
            onHome={() => navigateWorkbench("home", "/", onNavigate)}
            onProjects={() => navigateWorkbench("project", "/projects", onNavigate)}
            standaloneMode
            canvasProjects={canvasProjects}
            currentProjectId={canvasContext.canvasProjectId}
            canvasProjectsStatus={canvasProjectsStatus}
            canvasProjectsError={canvasProjectsError}
            onReloadProjects={loadCanvasProjects}
            onSelectProject={selectCanvasProject}
            onNewProject={createNewProject}
            onDeleteProject={deleteProject}
            onImportImage={importCanvasImage}
            theme={canvasColorScheme}
          />
        </CanvasGenerationConfigProvider>

          {saveConflict ? (
            <section className="lm-save-conflict" role="alertdialog" aria-labelledby="lm-save-conflict-title" aria-describedby="lm-save-conflict-description">
              <TriangleAlert size={20} aria-hidden="true" />
              <div className="lm-save-conflict-copy">
                <strong id="lm-save-conflict-title">云端版本已更新</strong>
                <p id="lm-save-conflict-description">你的本地编辑已安全保留，尚未覆盖云端。请选择要继续使用的版本。</p>
                {conflictError ? <span>{conflictError}</span> : null}
              </div>
              <div className="lm-save-conflict-actions">
                <button type="button" disabled={Boolean(conflictAction)} onClick={() => resolveSaveConflict("server")}>
                  <CloudDownload size={15} aria-hidden="true" />
                  {conflictAction === "server" ? "正在加载" : "使用云端版本"}
                </button>
                <button type="button" className="is-primary" disabled={Boolean(conflictAction)} onClick={() => resolveSaveConflict("local")}>
                  <UploadCloud size={15} aria-hidden="true" />
                  {conflictAction === "local" ? "正在保存" : "保留本地并覆盖云端"}
                </button>
              </div>
            </section>
          ) : null}

          {projectNameConflict ? (
            <section className="lm-save-conflict" role="alertdialog" aria-labelledby="lm-title-conflict-title" aria-describedby="lm-title-conflict-description">
              <TriangleAlert size={20} aria-hidden="true" />
              <div className="lm-save-conflict-copy">
                <strong id="lm-title-conflict-title">云端标题已更新</strong>
                <p id="lm-title-conflict-description">本地标题“{projectNameConflict.localTitle}”尚未覆盖云端标题“{projectNameConflict.serverTitle}”。</p>
              </div>
              <div className="lm-save-conflict-actions">
                <button type="button" disabled={Boolean(projectNameConflictAction)} onClick={() => resolveProjectNameConflict("server")}>
                  <CloudDownload size={15} aria-hidden="true" />
                  {projectNameConflictAction === "server" ? "正在采用" : "使用云端标题"}
                </button>
                <button type="button" className="is-primary" disabled={Boolean(projectNameConflictAction)} onClick={() => resolveProjectNameConflict("local")}>
                  <UploadCloud size={15} aria-hidden="true" />
                  {projectNameConflictAction === "local" ? "正在保存" : "保留本地并覆盖"}
                </button>
              </div>
            </section>
          ) : null}

      </div>
    </WorkbenchChrome>
  );
}

function NewCanvasApp({ route = null }) {
  const query = new URLSearchParams(window.location.search);
  const canvasProjectId = String(
    route?.canvasProjectId
      ?? query.get("canvasProjectId")
      ?? "",
  ).trim();
  const embedded = route?.embedded === true;
  const onNavigate = route?.onNavigate;
  if (canvasProjectId) return <NewCanvasPage canvasProjectId={canvasProjectId} embedded={embedded} onNavigate={onNavigate} />;
  return (
    <WorkbenchChrome view="list" embedded={embedded}>
      <NewCanvasProjectGallery />
    </WorkbenchChrome>
  );
}

const mountedRoots = new WeakMap();

export function mountNewCanvas(container, options = {}) {
  if (!container) throw new Error("new_canvas_mount_container_required");
  mountedRoots.get(container)?.unmount?.();
  const root = createRoot(container);
  root.render(
    <WorkbenchThemeProvider>
      <NewCanvasApp route={options} />
    </WorkbenchThemeProvider>,
  );
  mountedRoots.set(container, root);
  return () => {
    if (mountedRoots.get(container) !== root) return;
    root.unmount();
    mountedRoots.delete(container);
  };
}

const standaloneRoot = document.querySelector("#new-canvas-root");
if (standaloneRoot) mountNewCanvas(standaloneRoot);
