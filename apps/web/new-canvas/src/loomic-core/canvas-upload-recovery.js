const TERMINAL_UPLOAD_SESSION_STATUSES = new Set(["failed", "expired"]);
const TERMINAL_STORAGE_OBJECT_STATUSES = new Set(["deleted", "failed"]);

function uploadSessionIdFor(element) {
  if (!element || element.isDeleted || element.customData?.cloudArchiveStatus !== "archived") return "";
  const media = element.type === "image"
    || element.type === "embeddable" && element.customData?.isVideo
    || element.customData?.type === "audio-node" && element.customData?.sourceKind === "upload";
  return media ? String(element.customData?.uploadSessionId ?? "").trim() : "";
}

export function collectCanvasUploadRecoveryCandidates(elements = []) {
  const candidates = new Map();
  for (const element of Array.isArray(elements) ? elements : []) {
    const uploadSessionId = uploadSessionIdFor(element);
    if (!uploadSessionId) continue;
    const elementIds = candidates.get(uploadSessionId) ?? [];
    elementIds.push(element.id);
    candidates.set(uploadSessionId, elementIds);
  }
  return [...candidates].map(([uploadSessionId, elementIds]) => ({ uploadSessionId, elementIds }));
}

export function canvasUploadStatusNeedsSourceFile(payload) {
  const sessionStatus = String(payload?.uploadSession?.status ?? "").trim().toLowerCase();
  const objectStatus = String(payload?.storageObject?.status ?? "").trim().toLowerCase();
  return TERMINAL_UPLOAD_SESSION_STATUSES.has(sessionStatus)
    || TERMINAL_STORAGE_OBJECT_STATUSES.has(objectStatus);
}

export async function inspectCanvasUploadRecovery(elements, getUploadSession, options = {}) {
  const candidates = collectCanvasUploadRecoveryCandidates(elements);
  if (!candidates.length || typeof getUploadSession !== "function") {
    return { checkedSessionIds: [], unavailableSessionIds: [] };
  }
  const concurrency = Math.max(1, Math.min(8, Math.floor(Number(options.concurrency) || 4)));
  const queue = candidates.slice();
  const checkedSessionIds = [];
  const unavailableSessionIds = [];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const candidate = queue.shift();
      if (!candidate) return;
      try {
        const payload = await getUploadSession(candidate.uploadSessionId);
        checkedSessionIds.push(candidate.uploadSessionId);
        if (canvasUploadStatusNeedsSourceFile(payload)) unavailableSessionIds.push(candidate.uploadSessionId);
      } catch {
        // Connectivity and authentication failures do not prove that the source is gone.
      }
    }
  });
  await Promise.all(workers);
  return { checkedSessionIds, unavailableSessionIds };
}

export function markCanvasUploadsForSourceRecovery(elements = [], unavailableSessionIds = []) {
  const unavailable = new Set(unavailableSessionIds.map((value) => String(value ?? "").trim()).filter(Boolean));
  if (!unavailable.size) return { elements, changed: false, elementIds: [] };
  const elementIds = [];
  const next = elements.map((element) => {
    const uploadSessionId = uploadSessionIdFor(element);
    if (!unavailable.has(uploadSessionId)) return element;
    elementIds.push(element.id);
    return {
      ...element,
      customData: {
        ...(element.customData ?? {}),
        cloudArchiveStatus: "failed",
        archiveRetryState: "needs-file",
        requiresSourceFile: true,
        archiveError: "云端源文件已失效，请重新选择源文件。",
      },
      version: (element.version ?? 1) + 1,
      versionNonce: Math.floor(Math.random() * 2_000_000_000),
      updated: Date.now(),
    };
  });
  return { elements: elementIds.length ? next : elements, changed: Boolean(elementIds.length), elementIds };
}
