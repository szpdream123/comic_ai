export const CANVAS_HISTORY_VERSION = 1;
export const DEFAULT_CANVAS_HISTORY_LIMIT = 12;
export const DEFAULT_CANVAS_HISTORY_BYTES = 48 * 1024 * 1024;

function cloneJson(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function serializedBytes(value) {
  const json = JSON.stringify(value);
  if (typeof TextEncoder === "function") return new TextEncoder().encode(json).byteLength;
  return json.length * 2;
}

function hashString(value) {
  let first = 2166136261;
  let second = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ (code + index), 2246822519);
  }
  return `${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}:${value.length}`;
}

function fingerprintElement(element) {
  if (!element || element.isDeleted) return null;
  const copy = cloneJson(element, {});
  delete copy.version;
  delete copy.versionNonce;
  delete copy.updated;
  delete copy.index;
  return copy;
}

export function canvasVersionFingerprint(content) {
  const files = Object.entries(content?.files ?? {}).sort(([left], [right]) => left.localeCompare(right)).map(([id, file]) => ({
    id,
    mimeType: file?.mimeType ?? "",
    data: hashString(String(file?.dataURL ?? "")),
  }));
  const stable = {
    elements: (content?.elements ?? []).map(fingerprintElement).filter(Boolean),
    appState: {
      viewBackgroundColor: content?.appState?.viewBackgroundColor,
      gridModeEnabled: content?.appState?.gridModeEnabled,
      theme: content?.appState?.theme,
    },
    files,
  };
  return hashString(JSON.stringify(stable));
}

export function summarizeCanvasVersion(content) {
  const elements = (content?.elements ?? []).filter((element) => element && !element.isDeleted);
  const nodes = elements.filter((element) => element.type !== "arrow");
  const media = nodes.filter((element) => element.type === "image" || element.type === "embeddable" || ["image-generator", "video-generator"].includes(element.customData?.type));
  return {
    nodeCount: nodes.length,
    edgeCount: elements.length - nodes.length,
    mediaCount: media.length,
  };
}

function normalizeState(value) {
  if (!value || value.version !== CANVAS_HISTORY_VERSION || !Array.isArray(value.entries)) {
    return { version: CANVAS_HISTORY_VERSION, entries: [] };
  }
  return {
    version: CANVAS_HISTORY_VERSION,
    entries: value.entries.filter((entry) => entry?.id && entry?.content && entry?.fingerprint).map((entry) => ({
      ...entry,
      content: cloneJson(entry.content, { elements: [], appState: {}, files: {} }),
      byteSize: Number(entry.byteSize) || serializedBytes(entry.content),
      summary: entry.summary ?? summarizeCanvasVersion(entry.content),
    })),
  };
}

function entryMetadata(entry) {
  const { content: _content, ...metadata } = entry;
  return cloneJson(metadata, null);
}

export function createCanvasVersionHistoryStore({
  store,
  maxEntries = DEFAULT_CANVAS_HISTORY_LIMIT,
  maxBytes = DEFAULT_CANVAS_HISTORY_BYTES,
  now = () => new Date().toISOString(),
  idFactory = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
} = {}) {
  let statePromise = null;
  let writeChain = Promise.resolve();
  const listeners = new Set();
  const loadState = async () => {
    if (!statePromise) statePromise = Promise.resolve(store?.load?.()).then(normalizeState).catch(() => normalizeState(null));
    return statePromise;
  };
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const persist = async (state) => {
    await store?.save?.(state);
    statePromise = Promise.resolve(state);
    notify();
  };
  const prune = (entries) => {
    const kept = [];
    let totalBytes = 0;
    for (const entry of entries) {
      if (kept.length >= Math.max(1, Number(maxEntries) || DEFAULT_CANVAS_HISTORY_LIMIT)) break;
      if (totalBytes + entry.byteSize > Math.max(1, Number(maxBytes) || DEFAULT_CANVAS_HISTORY_BYTES)) continue;
      kept.push(entry);
      totalBytes += entry.byteSize;
    }
    return kept;
  };

  return {
    async record(content, metadata = {}) {
      const task = async () => {
        const state = await loadState();
        const snapshot = cloneJson(content, null);
        if (!snapshot) return { saved: false, reason: "invalid" };
        const fingerprint = canvasVersionFingerprint(snapshot);
        const savedAt = String(metadata.savedAt ?? now());
        const byteSize = serializedBytes(snapshot);
        if (byteSize > Math.max(1, Number(maxBytes) || DEFAULT_CANVAS_HISTORY_BYTES)) {
          return { saved: false, reason: "too_large" };
        }
        const common = {
          savedAt,
          source: metadata.source === "cloud" ? "cloud" : metadata.source === "conflict" ? "conflict" : "local",
          serverRevision: metadata.serverRevision !== null && metadata.serverRevision !== undefined && Number.isFinite(Number(metadata.serverRevision))
            ? Number(metadata.serverRevision)
            : null,
          fingerprint,
          byteSize,
          summary: summarizeCanvasVersion(snapshot),
          content: snapshot,
        };
        let entry;
        let entries;
        if (state.entries[0]?.fingerprint === fingerprint) {
          entry = { ...state.entries[0], ...common };
          entries = [entry, ...state.entries.slice(1)];
        } else {
          entry = { id: String(idFactory()), ...common };
          entries = [entry, ...state.entries];
        }
        const nextState = { version: CANVAS_HISTORY_VERSION, entries: prune(entries) };
        await persist(nextState);
        return { saved: true, deduplicated: entry.id === state.entries[0]?.id, entry: entryMetadata(entry) };
      };
      writeChain = writeChain.catch(() => undefined).then(task);
      return writeChain;
    },
    async list() {
      await writeChain.catch(() => undefined);
      const state = await loadState();
      return state.entries.map(entryMetadata).filter(Boolean);
    },
    async get(id) {
      await writeChain.catch(() => undefined);
      const state = await loadState();
      const entry = state.entries.find((item) => item.id === id);
      return entry ? cloneJson(entry, null) : null;
    },
    async clear() {
      writeChain = writeChain.catch(() => undefined).then(async () => {
        if (store?.remove) await store.remove();
        else await store?.save?.(normalizeState(null));
        statePromise = Promise.resolve(normalizeState(null));
        notify();
      });
      return writeChain;
    },
    subscribe(listener) {
      if (typeof listener !== "function") return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
