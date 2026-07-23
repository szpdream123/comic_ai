import {
  canvasWorkflowNodeType,
  canvasWorkflowPorts,
  collectCanvasWorkflowEdges,
} from "./canvas-workflow-edges.js";
import { compactCanvasElementsForPersistence, isStableCanvasMediaUrl } from "./canvas-file-persistence.js";
import { subscribeCanvasLive } from "./canvas-live-client.js";
import { canvasVersionFingerprint } from "./canvas-version-history.js";

const SCENE_NODE_ID = "__loomic_scene_v1__";
const SCENE_VERSION = 1;
const CLOUD_SAVE_RETRY_DELAYS = [400, 1200];

const EMPTY_CONTENT = {
  elements: [],
  appState: {
    viewBackgroundColor: "#ffffff",
    gridModeEnabled: false,
  },
  files: {},
};

export function isCloudCanvasProjectId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value ?? "").trim(),
  );
}

export function canvasContentToDocument(content, input) {
  const normalized = sanitizeCanvasContentForCloud(normalizeContent(content));
  const previous = input.previousDocument && typeof input.previousDocument === "object"
    ? input.previousDocument
    : {};
  const now = input.now?.() ?? new Date().toISOString();
  const canvasProjectId = String(input.canvasProjectId ?? previous.canvasProjectId ?? "").trim();
  const viewport = viewportFromAppState(normalized.appState, previous.viewport);
  const nodes = [sceneNode(normalized, viewport)];
  const seenIds = new Set([SCENE_NODE_ID]);

  normalized.elements.forEach((element, index) => {
    const node = elementNode(element, index);
    if (!node || seenIds.has(node.id)) return;
    seenIds.add(node.id);
    nodes.push(node);
  });

  const edges = collectCanvasWorkflowEdges(normalized.elements);

  return {
    version: Number(previous.version ?? 2) || 2,
    canvasProjectId,
    viewport,
    nodes,
    edges,
    groups: Array.isArray(previous.groups) ? cloneJson(previous.groups, []) : [],
    createdAt: typeof previous.createdAt === "string" && previous.createdAt ? previous.createdAt : now,
    updatedAt: now,
  };
}

export function sanitizeCanvasContentForCloud(content) {
  const normalized = normalizeContent(content);
  const files = {};
  const unavailableFileIds = new Set();
  for (const [fileId, file] of Object.entries(normalized.files)) {
    const dataURL = String(file?.dataURL ?? "").trim();
    if (/^(?:data:|blob:)/i.test(dataURL)) {
      unavailableFileIds.add(fileId);
      continue;
    }
    files[fileId] = file;
  }
  const elements = compactCanvasElementsForPersistence(normalized.elements).map((element) => {
    let nextElement = element;
    if (element?.type === "image" && unavailableFileIds.has(String(element.fileId ?? ""))) {
      const storageUrl = String(element.customData?.storageUrl ?? element.customData?.resultUrl ?? "").trim();
      if (isStableCanvasMediaUrl(storageUrl)) {
        files[element.fileId] = { ...(normalized.files[element.fileId] ?? {}), dataURL: storageUrl };
      } else {
        nextElement = {
          ...element,
          customData: {
            ...element.customData,
            cloudArchiveStatus: "pending",
            archiveRetryState: "pending",
            requiresSourceFile: true,
          },
        };
      }
    }
    const inputImages = Array.isArray(nextElement?.customData?.inputImages) ? nextElement.customData.inputImages : null;
    const stableInputImages = inputImages?.filter((value) => isStableCanvasMediaUrl(value?.url ?? value?.dataURL ?? value));
    if (!inputImages || stableInputImages.length === inputImages.length) return nextElement;
    return {
      ...nextElement,
      customData: {
        ...nextElement.customData,
        inputImages: stableInputImages,
        referenceArchiveStatus: "pending",
      },
    };
  });
  return { ...normalized, elements, files };
}

export function canvasDocumentToContent(document) {
  if (!document || typeof document !== "object") return null;
  const nodes = Array.isArray(document.nodes) ? document.nodes : [];
  const scene = nodes.find((node) => node?.id === SCENE_NODE_ID && node?.data?.loomicSceneVersion === SCENE_VERSION);
  if (!scene) {
    return nodes.length ? null : normalizeContent(EMPTY_CONTENT);
  }

  const appState = cloneJson(scene.data?.appState, {});
  const files = cloneJson(scene.data?.files, {});
  const elements = nodes
    .filter((node) => node?.data?.loomicElementVersion === SCENE_VERSION && node.data.loomicElement)
    .sort((left, right) => Number(left.data.loomicOrder ?? 0) - Number(right.data.loomicOrder ?? 0))
    .map((node) => cloneJson(node.data.loomicElement, null))
    .filter(Boolean);
  const viewport = document.viewport && typeof document.viewport === "object" ? document.viewport : {};

  if (appState.scrollX === undefined && Number.isFinite(Number(viewport.x))) {
    appState.scrollX = Number(viewport.x);
  }
  if (appState.scrollY === undefined && Number.isFinite(Number(viewport.y))) {
    appState.scrollY = Number(viewport.y);
  }
  if (appState.zoom === undefined && Number.isFinite(Number(viewport.zoom))) {
    appState.zoom = { value: Number(viewport.zoom) };
  }

  return normalizeContent({ elements, appState, files });
}

export function createCloudCanvasStorage({
  localStore,
  creatorApi,
  canvasProjectId,
  onConflict,
  historyStore,
  conflictStore,
  lifecycleStore,
  syncStateStore,
  now = () => new Date().toISOString(),
  retryDelays = CLOUD_SAVE_RETRY_DELAYS,
  sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
  subscribeLive = subscribeCanvasLive,
}) {
  const cloudCanvasProjectId = isCloudCanvasProjectId(canvasProjectId) ? String(canvasProjectId) : null;
  let initialized = false;
  let initializePromise = null;
  let loadedContent = null;
  let cloudCanvas = null;
  let cloudWritable = false;
  let pendingConflict = null;
  let initialSaveState = "saved";
  let saveChain = Promise.resolve();
  const remoteUpdateListeners = new Set();
  let unsubscribeLive = null;
  const ensureLiveSubscription = () => {
    const liveCanvasProjectId = String(cloudCanvas?.canvasProjectId ?? cloudCanvasProjectId ?? "").trim();
    if (!liveCanvasProjectId || unsubscribeLive || !remoteUpdateListeners.size) return;
    unsubscribeLive = subscribeLive(liveCanvasProjectId, (event) => {
      const serverRevision = Number(event?.serverRevision ?? 0);
      if (event?.type !== "revision" || serverRevision <= Number(cloudCanvas?.serverRevision ?? 0)) return;
      for (const listener of remoteUpdateListeners) listener(event);
    });
  };
  const setCloudSyncPending = async (pending, content = loadedContent) => {
    if (!syncStateStore) return;
    try {
      if (pending) await syncStateStore.save?.({ cloudPending: true, savedAt: now() });
      else await syncStateStore.save?.({
        cloudPending: false,
        contentFingerprint: canvasVersionFingerprint(normalizeContent(content)),
        savedAt: now(),
      });
    } catch (error) {
      console.warn("[loomic-canvas] cloud sync state could not be saved", error);
    }
  };
  const recordHistory = async (content, source) => {
    if (!historyStore?.record) return;
    try {
      await historyStore.record(content, {
        source,
        serverRevision: source === "cloud" ? cloudCanvas?.serverRevision : null,
        savedAt: now(),
      });
    } catch (error) {
      console.warn("[loomic-canvas] version snapshot could not be recorded", error);
    }
  };
  const clearLifecycleDraftIfSaved = async (content) => {
    if (typeof lifecycleStore?.remove !== "function") return;
    if (typeof lifecycleStore.load !== "function") {
      await Promise.resolve(lifecycleStore.remove()).catch(() => undefined);
      return;
    }
    const draft = await Promise.resolve(lifecycleStore.load()).catch(() => undefined);
    if (draft?.content && JSON.stringify(normalizeContent(draft.content)) !== JSON.stringify(normalizeContent(content))) return;
    await Promise.resolve(lifecycleStore.remove()).catch(() => undefined);
  };

  const initialize = async () => {
    if (initialized) return loadedContent;
    if (initializePromise) return initializePromise;
    initializePromise = (async () => {
      const storedLocalContent = await localStore.load().catch(() => null);
      const localContent = normalizeContent(storedLocalContent);
      const hasStoredLocalDraft = Boolean(syncStateStore && storedLocalContent);
      const lifecycleDraft = await Promise.resolve(lifecycleStore?.load?.()).catch(() => null);
      const syncState = await Promise.resolve(syncStateStore?.load?.()).catch(() => null);
      const cloudSyncPending = syncState?.cloudPending === true;
      const localContentFingerprint = canvasVersionFingerprint(localContent);
      const syncedContentFingerprint = String(syncState?.contentFingerprint ?? "");
      const localSyncStateUncertain = Boolean(
        hasStoredLocalDraft
        && (
          !syncState
          || syncState.cloudPending !== true
            && String(syncState.contentFingerprint ?? "") !== localContentFingerprint
        )
      );
      const recoveredLifecycleDraft = Boolean(lifecycleDraft?.content);
      initialSaveState = cloudCanvasProjectId && (cloudSyncPending || localSyncStateUncertain || recoveredLifecycleDraft)
        ? "local"
        : "saved";
      loadedContent = recoveredLifecycleDraft ? normalizeContent(lifecycleDraft.content) : localContent;
      if (recoveredLifecycleDraft) {
        await localStore.save(loadedContent).catch(() => undefined);
        await Promise.resolve(lifecycleStore?.remove?.()).catch(() => undefined);
      }
      const storedConflict = await conflictStore?.load?.().catch(() => null);
      if (storedConflict?.serverContent && Number(storedConflict?.serverRevision) >= 1) {
        pendingConflict = {
          serverContent: normalizeContent(storedConflict.serverContent),
          serverRevision: Number(storedConflict.serverRevision),
        };
      }
      const loadCloudCanvas = creatorApi?.getStandaloneCanvas;
      if (cloudCanvasProjectId && typeof loadCloudCanvas === "function") {
        try {
          const payload = await loadCloudCanvas.call(creatorApi, cloudCanvasProjectId);
          const canvas = payload?.canvas ?? payload;
          const cloudContent = canvasDocumentToContent(canvas?.document);
          if (canvas?.document && cloudContent) {
            const cloudContentFingerprint = canvasVersionFingerprint(cloudContent);
            const recoveredLifecycleRemoteDivergence = Boolean(
              recoveredLifecycleDraft
              && syncedContentFingerprint
              && syncedContentFingerprint !== cloudContentFingerprint
            );
            cloudCanvas = canvas;
            cloudWritable = true;
            if (pendingConflict) {
              pendingConflict = {
                serverContent: cloudContent,
                serverRevision: Number(canvas.serverRevision ?? pendingConflict.serverRevision) || pendingConflict.serverRevision,
              };
              await conflictStore?.save?.(pendingConflict).catch(() => undefined);
            } else if (
              (cloudSyncPending || localSyncStateUncertain || recoveredLifecycleRemoteDivergence)
              && canvasVersionFingerprint(loadedContent) !== cloudContentFingerprint
            ) {
              await recordHistory(loadedContent, "conflict");
              pendingConflict = {
                serverContent: cloudContent,
                serverRevision: Number(canvas.serverRevision ?? 1) || 1,
              };
              await conflictStore?.save?.(pendingConflict).catch(() => undefined);
            } else if (!recoveredLifecycleDraft) {
              loadedContent = cloudContent;
              await localStore.save(cloudContent).catch(() => undefined);
              await setCloudSyncPending(false, cloudContent);
              initialSaveState = "saved";
            }
          } else if (canvas?.document) {
            cloudCanvas = canvas;
            cloudWritable = false;
          }
        } catch {
          // Authentication, availability, and network failures retain the local canvas.
        }
      }
      if (pendingConflict) {
        initialSaveState = "conflict";
        await onConflict?.(pendingConflict.serverContent);
      }
      initialized = true;
      return loadedContent;
    })();
    return initializePromise;
  };

  const saveNow = async (content) => {
    const normalized = normalizeContent(content);
    loadedContent = normalized;
    if (cloudCanvasProjectId) await setCloudSyncPending(true);
    await localStore.save(normalized);
    await clearLifecycleDraftIfSaved(normalized);
    if (pendingConflict) {
      return { status: "conflict", serverRevision: pendingConflict.serverRevision };
    }
    const saveCloudCanvas = creatorApi?.saveStandaloneCanvas;
    const loadCloudCanvas = creatorApi?.getStandaloneCanvas;
    if (cloudCanvasProjectId && (!cloudWritable || !cloudCanvas) && typeof loadCloudCanvas === "function") {
      try {
        const payload = await loadCloudCanvas.call(creatorApi, cloudCanvasProjectId);
        const canvas = payload?.canvas ?? payload;
        const cloudContent = canvasDocumentToContent(canvas?.document);
        if (canvas?.document && cloudContent) {
          cloudCanvas = canvas;
          cloudWritable = true;
          if (canvasVersionFingerprint(cloudContent) !== canvasVersionFingerprint(normalized)) {
            await recordHistory(normalized, "conflict");
            pendingConflict = {
              serverContent: cloudContent,
              serverRevision: Number(canvas.serverRevision ?? 1) || 1,
            };
            await conflictStore?.save?.(pendingConflict).catch(() => undefined);
            await onConflict?.(cloudContent);
            return { status: "conflict", serverRevision: pendingConflict.serverRevision };
          }
        }
      } catch {
        // Keep the verified local save and retry cloud availability on the next save.
      }
    }
    if (!cloudCanvasProjectId || !cloudWritable || !cloudCanvas || typeof saveCloudCanvas !== "function") {
      await recordHistory(normalized, "local");
      return {
        status: "saved",
        source: "local",
        ...(cloudCanvasProjectId ? { cloudPending: true } : {}),
      };
    }

    const document = canvasContentToDocument(normalized, {
      canvasProjectId: cloudCanvas.canvasProjectId ?? cloudCanvasProjectId,
      previousDocument: cloudCanvas.document,
      now,
    });
    try {
      const input = {
        clientRevision: Number(cloudCanvas.serverRevision ?? 1) || 1,
        document,
        events: [],
      };
      const payload = await retryCloudSave(
        () => saveCloudCanvas.call(creatorApi, cloudCanvasProjectId, input),
        retryDelays,
        sleep,
      );
      cloudCanvas = payload?.canvas ?? payload ?? cloudCanvas;
      await setCloudSyncPending(false, normalized);
      await recordHistory(normalized, "cloud");
      return { status: "saved", source: "cloud", serverRevision: cloudCanvas?.serverRevision ?? null };
    } catch (error) {
      const serverDocument = error?.details?.serverDocument;
      if (error?.errorCode !== "canvas_revision_conflict" || !serverDocument) {
        throw error;
      }
      const serverContent = canvasDocumentToContent(serverDocument);
      cloudCanvas = {
        ...cloudCanvas,
        serverRevision: Number(error.details?.serverRevision ?? cloudCanvas.serverRevision ?? 1) || 1,
        document: serverDocument,
      };
      cloudWritable = Boolean(serverContent);
      if (!serverContent) throw error;
      await recordHistory(normalized, "conflict");
      pendingConflict = {
        serverContent,
        serverRevision: cloudCanvas.serverRevision,
      };
      await conflictStore?.save?.(pendingConflict).catch(() => undefined);
      await onConflict?.(serverContent);
      return { status: "conflict", serverRevision: cloudCanvas.serverRevision };
    }
  };

  return {
    initialize,
    async load() {
      return initialize();
    },
    getInitialSaveState() {
      return initialSaveState;
    },
    async save(_canvasId, content) {
      await initialize();
      saveChain = saveChain.catch(() => undefined).then(() => saveNow(content));
      return saveChain;
    },
    stage(content) {
      return lifecycleStore?.save?.({ content: normalizeContent(content), savedAt: now() });
    },
    async resolveConflict(strategy, content) {
      await initialize();
      saveChain = saveChain.catch(() => undefined).then(async () => {
        if (!pendingConflict) {
          return strategy === "local" && content ? saveNow(content) : { status: "saved", source: "cloud", serverRevision: cloudCanvas?.serverRevision ?? null };
        }
        if (strategy === "server") {
          const beforeCommit = typeof content?.beforeCommit === "function" ? content.beforeCommit : null;
          let accepted = pendingConflict.serverContent;
          let serverRevision = pendingConflict.serverRevision;
          const loadCloudCanvas = creatorApi?.getStandaloneCanvas;
          if (cloudCanvasProjectId && typeof loadCloudCanvas === "function") {
            try {
              const payload = await loadCloudCanvas.call(creatorApi, cloudCanvasProjectId);
              const latestCanvas = payload?.canvas ?? payload;
              const latestContent = canvasDocumentToContent(latestCanvas?.document);
              const latestRevision = Number(latestCanvas?.serverRevision ?? 0);
              if (latestContent && latestRevision >= serverRevision) {
                accepted = latestContent;
                serverRevision = latestRevision;
                cloudCanvas = latestCanvas;
                cloudWritable = true;
              }
            } catch {
              // The conflict snapshot remains an authoritative server fallback while offline.
            }
          }
          await beforeCommit?.(accepted);
          loadedContent = accepted;
          await localStore.save(accepted);
          await setCloudSyncPending(false, accepted);
          pendingConflict = null;
          await conflictStore?.remove?.().catch(() => undefined);
          return { status: "saved", source: "cloud", serverRevision, content: accepted };
        }
        if (strategy !== "local" || !content) throw new Error("invalid_canvas_conflict_resolution");
        const previousConflict = pendingConflict;
        pendingConflict = null;
        await conflictStore?.remove?.().catch(() => undefined);
        try {
          return await saveNow(content);
        } catch (error) {
          pendingConflict = previousConflict;
          await conflictStore?.save?.(previousConflict).catch(() => undefined);
          throw error;
        }
      });
      return saveChain;
    },
    async remove() {
      loadedContent = normalizeContent(EMPTY_CONTENT);
      pendingConflict = null;
      await localStore.remove().catch(() => undefined);
      await conflictStore?.remove?.().catch(() => undefined);
      await Promise.resolve(lifecycleStore?.remove?.()).catch(() => undefined);
      await Promise.resolve(syncStateStore?.remove?.()).catch(() => undefined);
      await Promise.resolve(historyStore?.clear?.()).catch(() => undefined);
    },
    getCloudCanvas() {
      return cloudCanvas;
    },
    subscribeRemoteUpdates(listener) {
      if (!cloudCanvasProjectId || typeof listener !== "function") return () => undefined;
      remoteUpdateListeners.add(listener);
      ensureLiveSubscription();
      return () => {
        remoteUpdateListeners.delete(listener);
        if (!remoteUpdateListeners.size && unsubscribeLive) {
          unsubscribeLive();
          unsubscribeLive = null;
        }
      };
    },
    async checkForRemoteUpdate() {
      await initialize();
      if (pendingConflict || !cloudCanvas) return null;
      const canvasProjectId = String(cloudCanvas.canvasProjectId ?? "").trim();
      if (!canvasProjectId || typeof creatorApi?.getCanvasHead !== "function") return null;
      const payload = await creatorApi.getCanvasHead(canvasProjectId);
      const head = payload?.head;
      const currentRevision = Number(cloudCanvas.serverRevision ?? 0);
      const serverRevision = Number(head?.serverRevision ?? 0);
      if (serverRevision <= currentRevision) return null;
      const content = canvasDocumentToContent(head?.document);
      if (!content) return null;
      return {
        serverRevision,
        document: head.document,
        content,
      };
    },
    adoptRemoteUpdate(update) {
      const serverRevision = Number(update?.serverRevision ?? 0);
      const content = update?.content ? normalizeContent(update.content) : null;
      if (!content || !update?.document || pendingConflict || serverRevision <= Number(cloudCanvas?.serverRevision ?? 0)) return null;
      saveChain = saveChain.catch(() => undefined).then(async () => {
        if (pendingConflict || serverRevision <= Number(cloudCanvas?.serverRevision ?? 0)) return false;
        cloudCanvas = { ...cloudCanvas, serverRevision, document: update.document };
        loadedContent = content;
        await Promise.all([
          localStore.save(content),
          setCloudSyncPending(false, content),
          clearLifecycleDraftIfSaved(content),
          recordHistory(content, "cloud"),
        ]);
        return true;
      });
      return saveChain;
    },
    async listHistory(options) {
      await initialize();
      const paginated = Boolean(options && typeof options === "object");
      const requestedLimit = Number(options?.limit ?? 25);
      const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, Math.trunc(requestedLimit))) : 25;
      const beforeRevision = Number(options?.cursor);
      const canvasProjectId = String(cloudCanvas?.canvasProjectId ?? "").trim();
      if (canvasProjectId && typeof creatorApi?.listCanvasRevisions === "function") {
        try {
          const payload = await creatorApi.listCanvasRevisions(canvasProjectId, {
            limit: paginated ? limit : 50,
            ...(Number.isFinite(beforeRevision) && beforeRevision > 0 ? { beforeRevision } : {}),
          });
          const revisions = Array.isArray(payload?.revisions) ? payload.revisions : null;
          if (!revisions) throw new Error("invalid_canvas_revision_list");
          const cloudEntries = revisions.map((revision) => ({
            id: revision.id,
            savedAt: revision.createdAt,
            source: "cloud",
            serverRevision: revision.serverRevision,
            operation: revision.operation,
            summary: revision.summary,
          }));
          const cloudIds = new Set(cloudEntries.map((entry) => entry.id));
          const localEntries = Number.isFinite(beforeRevision) && beforeRevision > 0
            ? []
            : await Promise.resolve(historyStore?.list?.()).catch(() => []);
          const merged = [
            ...cloudEntries,
            ...localEntries.filter((entry) => entry?.source !== "cloud" && !cloudIds.has(entry?.id)),
          ].sort((left, right) => {
            const timeDifference = Date.parse(right?.savedAt ?? "") - Date.parse(left?.savedAt ?? "");
            return Number.isFinite(timeDifference) ? timeDifference : 0;
          });
          if (!paginated) return merged;
          return {
            entries: merged,
            nextCursor: payload?.hasMore ? payload.nextCursor : null,
            hasMore: Boolean(payload?.hasMore),
          };
        } catch {
          // Offline and unavailable revision history retains the local snapshots.
        }
      }
      const fallback = await Promise.resolve(historyStore?.list?.()).catch(() => []);
      return paginated ? { entries: fallback, nextCursor: null, hasMore: false } : fallback;
    },
    async getHistoryEntry(id) {
      await initialize();
      const canvasProjectId = String(cloudCanvas?.canvasProjectId ?? "").trim();
      if (canvasProjectId && typeof creatorApi?.getCanvasRevision === "function") {
        try {
          const payload = await creatorApi.getCanvasRevision(canvasProjectId, id);
          const revision = payload?.revision;
          const content = canvasDocumentToContent(revision?.document);
          if (!revision || !content) throw new Error("invalid_canvas_revision");
          return {
            id: revision.id,
            savedAt: revision.createdAt,
            source: "cloud",
            serverRevision: revision.serverRevision,
            operation: revision.operation,
            summary: revision.summary,
            content,
          };
        } catch {
          // Offline and unavailable revision history retains the local snapshots.
        }
      }
      return historyStore?.get?.(id) ?? null;
    },
    subscribeHistory(listener) {
      return historyStore?.subscribe?.(listener) ?? (() => undefined);
    },
  };
}

async function retryCloudSave(save, retryDelays, sleep) {
  const delays = Array.isArray(retryDelays) ? retryDelays : CLOUD_SAVE_RETRY_DELAYS;
  let attempt = 0;
  while (true) {
    try {
      return await save();
    } catch (error) {
      const delay = delays[attempt];
      if (delay === undefined || !isRetryableCloudSaveError(error)) throw error;
      attempt += 1;
      await sleep(Math.max(0, Number(delay) || 0));
    }
  }
}

function isRetryableCloudSaveError(error) {
  if (error?.errorCode === "canvas_revision_conflict") return false;
  const status = Number(error?.status ?? 0);
  if (!status) return true;
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function sceneNode(content, viewport) {
  return {
    id: SCENE_NODE_ID,
    type: "loomic_scene",
    position: { x: Number(viewport.x ?? 0), y: Number(viewport.y ?? 0) },
    size: { width: 1, height: 1 },
    zIndex: -2147483648,
    data: {
      title: "Loomic Scene",
      status: "ready",
      sourceKind: "loomic",
      loomicSceneVersion: SCENE_VERSION,
      appState: cloneJson(content.appState, {}),
      files: cloneJson(content.files, {}),
      ports: { inputs: [], outputs: [] },
    },
  };
}

function elementNode(element, order) {
  if (!element || typeof element !== "object") return null;
  const id = String(element.id ?? "").trim();
  if (!id) return null;
  const customData = element.customData && typeof element.customData === "object" ? element.customData : {};
  const nodeType = canvasWorkflowNodeType(element);
  const mediaKind = nodeType === "video"
    ? "video"
    : nodeType === "image"
      ? "image"
      : nodeType === "audio"
        ? "audio"
        : nodeType === "output" && customData.mediaKind
          ? String(customData.mediaKind)
          : null;
  const ports = canvasWorkflowPorts(nodeType);
  return {
    id,
    type: nodeType,
    position: { x: finiteNumber(element.x, 0), y: finiteNumber(element.y, 0) },
    size: { width: finiteNumber(element.width, 1), height: finiteNumber(element.height, 1) },
    zIndex: order,
    data: {
      title: String(customData.title ?? customData.prompt ?? element.text ?? nodeType).slice(0, 200),
      status: String(customData.status ?? "idle"),
      ...(mediaKind ? { mediaKind } : {}),
      ...(customData.model ? { modelCode: String(customData.model) } : {}),
      ...(customData.prompt ? { prompt: String(customData.prompt) } : {}),
      ...(customData.text ? { text: String(customData.text) } : {}),
      ...(customData.instructions ? { instructions: String(customData.instructions) } : {}),
      ...(customData.notes ? { notes: String(customData.notes) } : {}),
      ...(customData.executionAvailability ? { executionAvailability: String(customData.executionAvailability) } : {}),
      ports,
      loomicElementVersion: SCENE_VERSION,
      loomicOrder: order,
      loomicElement: cloneJson(element, {}),
    },
  };
}

function viewportFromAppState(appState, fallback) {
  const previous = fallback && typeof fallback === "object" ? fallback : {};
  const zoom = appState?.zoom && typeof appState.zoom === "object" ? appState.zoom.value : appState?.zoom;
  return {
    x: finiteNumber(appState?.scrollX, finiteNumber(previous.x, 0)),
    y: finiteNumber(appState?.scrollY, finiteNumber(previous.y, 0)),
    zoom: finiteNumber(zoom, finiteNumber(previous.zoom, 1)),
    gridVisible: appState?.gridModeEnabled ?? previous.gridVisible ?? false,
    snapEnabled: previous.snapEnabled ?? true,
  };
}

function normalizeContent(value) {
  const source = value && typeof value === "object" ? value : EMPTY_CONTENT;
  return {
    elements: Array.isArray(source.elements) ? cloneJson(source.elements, []) : [],
    appState: source.appState && typeof source.appState === "object"
      ? cloneJson(source.appState, {})
      : cloneJson(EMPTY_CONTENT.appState, {}),
    files: source.files && typeof source.files === "object" && !Array.isArray(source.files)
      ? cloneJson(source.files, {})
      : {},
  };
}

function cloneJson(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
