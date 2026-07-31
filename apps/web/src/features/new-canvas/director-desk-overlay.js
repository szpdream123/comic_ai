import {
  normalizeCanvasDirectorCapture,
  updateCanvasDirectorCaptureDocument,
} from "../production-workbench/canvas/canvas-director-node.js";
import { refreshCanvasWorkflowNode } from "../production-workbench/canvas/canvas-x6-graph.js";

const DIRECTOR_DESK_MODULE_URL = "/director-desk/director-desk.js";
let directorDeskModulePromise = null;

function loadDirectorDeskModule() {
  if (!directorDeskModulePromise) {
    directorDeskModulePromise = import(DIRECTOR_DESK_MODULE_URL).catch((error) => {
      directorDeskModulePromise = null;
      throw error;
    });
  }
  return directorDeskModulePromise;
}

function normalizeDeskKey(node) {
  const data = node?.data && typeof node.data === "object" ? node.data : {};
  return String(data.directorDeskKey ?? data.deskKey ?? data.instanceId ?? "").trim();
}

function dataUrlToFile(dataUrl, fileName) {
  const match = String(dataUrl ?? "").match(/^data:([^;,]+)?(?:;[^,]*)?,(.*)$/s);
  if (!match) throw new Error("director_capture_data_url_invalid");
  const contentType = match[1] || "image/png";
  const body = match[2] || "";
  const bytes = atob(body.replace(/\s/g, ""));
  const buffer = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) buffer[index] = bytes.charCodeAt(index);
  return new File([buffer], fileName || "director-desk-capture.png", { type: contentType });
}

function resolveCanvasProjectId(workbench) {
  return String(
    workbench?.ui?.selectedCanvasProjectId
      ?? workbench?.ui?.canvasDocument?.canvasProjectId
      ?? "",
  ).trim();
}

function resolveTheme(workbench) {
  return workbench?.ui?.selectedWorkbenchTheme === "daylight" ? "light" : "dark";
}

function createDirectorPanoramaUploadId() {
  const token = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `director-panorama:${token}`;
}

export async function uploadCanvasDirectorPanorama(workbench, file) {
  if (typeof workbench?.api?.uploadFile !== "function") {
    throw new Error("canvas_director_panorama_upload_api_unavailable");
  }
  const result = await workbench.api.uploadFile(file, {
    category: "director-panorama",
    purpose: "director-panorama",
    projectId: null,
    idempotencyKey: createDirectorPanoramaUploadId(),
  });
  const storageObjectId = String(result?.upload?.storageObjectId ?? result?.storageObject?.id ?? "").trim();
  const uploadSessionId = String(result?.upload?.uploadSessionId ?? "").trim();
  const url = storageObjectId
    ? `/api/storage/objects/${encodeURIComponent(storageObjectId)}/content?proxy=1`
    : uploadSessionId
      ? `/api/storage/upload-sessions/${encodeURIComponent(uploadSessionId)}/content`
      : String(result?.upload?.publicUrl ?? result?.upload?.sourceUrl ?? "").trim();
  if (!url) throw new Error("canvas_director_panorama_upload_url_missing");
  return { url };
}

function isTeamMemberSession(session) {
  return String(session?.user?.actorType ?? "").trim().toLowerCase() === "team_member";
}

function resolveDirectorDeskRecordKey(record) {
  return String(record?.id ?? record?.deskKey ?? "").trim();
}

function canvasDirectorDeskName(node) {
  return `画布导演台 · ${String(node?.id ?? "").trim()}`.slice(0, 100);
}

function selectDeterministicDirectorDesk(records = []) {
  return [...records]
    .filter((record) => resolveDirectorDeskRecordKey(record))
    .sort((left, right) => {
      const leftKey = resolveDirectorDeskRecordKey(left);
      const rightKey = resolveDirectorDeskRecordKey(right);
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    })[0] ?? null;
}

export async function ensureDirectorDeskNodeBinding(workbench, node) {
  const existingDeskKey = normalizeDeskKey(node);
  if (existingDeskKey && isTeamMemberSession(workbench?.session)) {
    return { node, directorDeskKey: existingDeskKey, created: false };
  }
  if (typeof workbench?.api?.listDirectorDesks !== "function") {
    throw new Error("canvas_director_list_api_unavailable");
  }
  if (typeof workbench?.updateCanvasDocument !== "function" || typeof workbench?.saveCanvasNow !== "function") {
    throw new Error("canvas_director_binding_persistence_unavailable");
  }
  const canvasProjectId = resolveCanvasProjectId(workbench);
  if (!canvasProjectId) throw new Error("canvas_director_scope_missing");
  const document = workbench?.ui?.canvasDocument;
  const nodeId = String(node?.id ?? "").trim();
  if (!nodeId || !Array.isArray(document?.nodes) || !document.nodes.some((item) => item.id === nodeId)) {
    throw new Error("canvas_director_node_not_found");
  }
  const listPayload = await workbench.api.listDirectorDesks();
  const desks = Array.isArray(listPayload?.desks)
    ? listPayload.desks
    : Array.isArray(listPayload?.data?.desks) ? listPayload.data.desks : [];
  const dedicatedDeskName = canvasDirectorDeskName(node);
  const existingDesk = desks.find((record) => resolveDirectorDeskRecordKey(record) === existingDeskKey);
  if (existingDeskKey && String(existingDesk?.name ?? "").trim() === dedicatedDeskName) {
    return { node, directorDeskKey: existingDeskKey, created: false };
  }
  const occupiedDeskKeys = new Set(document.nodes
    .filter((item) => item?.id !== nodeId && item?.type === "ai-director")
    .map(normalizeDeskKey)
    .filter(Boolean));
  let desk = isTeamMemberSession(workbench.session)
    ? selectDeterministicDirectorDesk(
        desks.filter((record) => !occupiedDeskKeys.has(resolveDirectorDeskRecordKey(record))),
      )
    : desks.find((record) => String(record?.name ?? "").trim() === dedicatedDeskName) ?? null;
  let created = false;
  if (!desk) {
    if (isTeamMemberSession(workbench.session)) {
      throw new Error("canvas_director_assignment_required");
    }
    if (typeof workbench.api.createDirectorDesk !== "function") {
      throw new Error("canvas_director_create_api_unavailable");
    }
    const payload = await workbench.api.createDirectorDesk({
      name: dedicatedDeskName,
    });
    desk = payload?.desk ?? payload?.data?.desk ?? payload;
    created = true;
  }
  const directorDeskKey = resolveDirectorDeskRecordKey(desk);
  if (!directorDeskKey) throw new Error("canvas_director_key_missing");
  const nextNode = {
    ...node,
    data: { ...(node.data ?? {}), directorDeskKey },
  };
  const nextDocument = {
    ...document,
    nodes: document.nodes.map((item) => item.id === nodeId ? nextNode : item),
  };
  const previousDocumentsByProject = workbench.ui.canvasDocumentsByProject;
  try {
    workbench.ui.canvasDocument = nextDocument;
    workbench.ui.canvasDocumentsByProject = {
      ...(previousDocumentsByProject && typeof previousDocumentsByProject === "object"
        ? previousDocumentsByProject
        : {}),
      [canvasProjectId]: nextDocument,
    };
    workbench.updateCanvasDocument(nextDocument);
    const saved = await workbench.saveCanvasNow();
    if (!saved) throw new Error("canvas_director_binding_save_failed");
  } catch (error) {
    workbench.ui.canvasDocument = document;
    if (previousDocumentsByProject === undefined) delete workbench.ui.canvasDocumentsByProject;
    else workbench.ui.canvasDocumentsByProject = previousDocumentsByProject;
    try {
      workbench.updateCanvasDocument(document);
    } catch (rollbackError) {
      console.warn("[new-canvas] director desk binding rollback failed", rollbackError);
    }
    workbench.ui.canvasDocument = document;
    if (previousDocumentsByProject === undefined) delete workbench.ui.canvasDocumentsByProject;
    else workbench.ui.canvasDocumentsByProject = previousDocumentsByProject;
    throw error;
  }
  return { node: nextNode, directorDeskKey, created };
}

export async function appendCanvasDirectorCapture(workbench, activeNode, file, metadata = {}) {
  const canvasProjectId = resolveCanvasProjectId(workbench);
  const nodeKey = String(activeNode?.id ?? "").trim();
  if (!canvasProjectId || !nodeKey) throw new Error("canvas_director_capture_scope_missing");
  const api = workbench?.api;
  if (typeof api?.uploadFile !== "function" || typeof api?.appendCanvasDirectorArtifact !== "function") {
    throw new Error("canvas_director_capture_api_unavailable");
  }
  const uploaded = await api.uploadFile(file, {
    category: "canvas-director-capture",
    purpose: "canvas-director-capture",
    projectId: null,
  });
  const storageObjectId = uploaded?.upload?.storageObjectId ?? uploaded?.storageObject?.id;
  if (!storageObjectId) throw new Error("canvas_director_capture_storage_missing");
  const directorArtifactKind = String(metadata.directorArtifactKind ?? "").trim().toLowerCase()
    || (file.type.startsWith("video/") ? "video" : "screenshot");
  const appended = await api.appendCanvasDirectorArtifact(canvasProjectId, nodeKey, {
    directorDeskKey: normalizeDeskKey(activeNode),
    storageObjectId,
    artifactKind: file.type.startsWith("video/") ? "video" : "image",
    expectedRevision: Number.isFinite(Number(workbench?.ui?.canvasServerRevision))
      ? Number(workbench.ui.canvasServerRevision)
      : undefined,
    metadata: {
      fileName: file.name,
      source: "director-desk",
      directorArtifactKind,
      ...metadata,
    },
  });
  const capture = normalizeCanvasDirectorCapture({
    artifact: appended?.artifact ?? appended?.data?.artifact,
    upload: uploaded?.upload,
    version: uploaded?.version,
    storageObject: uploaded?.storageObject,
    storageObjectId,
    artifactKind: file.type.startsWith("video/") ? "video" : "image",
    fileName: file.name,
    directorArtifactKind,
  });
  if (!capture) throw new Error("canvas_director_capture_identifiers_missing");
  const document = workbench?.ui?.canvasDocument;
  const nextDocument = updateCanvasDirectorCaptureDocument(document, nodeKey, capture);
  if (nextDocument === document) throw new Error("canvas_director_capture_node_update_failed");
  workbench.ui.canvasDocument = nextDocument;
  workbench.ui.canvasDocumentsByProject = {
    ...(workbench.ui.canvasDocumentsByProject && typeof workbench.ui.canvasDocumentsByProject === "object"
      ? workbench.ui.canvasDocumentsByProject
      : {}),
    [canvasProjectId]: nextDocument,
  };
  workbench.updateCanvasDocument?.(nextDocument);
  if (typeof workbench.saveCanvasNow === "function") {
    const saved = await workbench.saveCanvasNow();
    if (!saved) throw new Error("canvas_director_capture_save_failed");
  }
  refreshCanvasWorkflowNode(workbench, nodeKey);
  return {
    capture,
    node: nextDocument.nodes.find((item) => item.id === nodeKey) ?? activeNode,
    document: nextDocument,
  };
}

export function createDirectorDeskOverlay({ surface, workbench }) {
  let host = null;
  let module = null;
  let activeNode = null;
  let disposed = false;

  const waitForCaptureReady = async () => {
    let lastError = null;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        return await module.captureDirectorDeskFrame(host);
      } catch (error) {
        lastError = error;
        if (error?.message !== "Viewport capture handler is not registered") throw error;
        await new Promise((resolve) => globalThis.setTimeout?.(resolve, 50));
      }
    }
    throw lastError ?? new Error("director_desk_frame_unavailable");
  };

  const waitForVideoExportReady = async () => {
    let lastError = null;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        return await module.exportDirectorDeskReferenceVideo(host, { fps: 24, quality: "720p" });
      } catch (error) {
        lastError = error;
        if (error?.message !== "参考视频导出器尚未准备好") throw error;
        await new Promise((resolve) => globalThis.setTimeout?.(resolve, 50));
      }
    }
    throw lastError ?? new Error("director_desk_video_export_unavailable");
  };

  const notify = (message, tone = "error") => {
    workbench?.ui && (workbench.ui.toast = String(message ?? ""));
    workbench?.onDirectorDeskNotify?.(String(message ?? ""), tone);
  };

  const close = () => {
    if (host && module?.unmountDirectorDesk) {
      try { module.unmountDirectorDesk(host); } catch (error) { console.warn("[new-canvas] director desk unmount failed", error); }
    }
    host?.remove();
    host = null;
    module = null;
    activeNode = null;
  };

  const appendFile = async (file, metadata = {}) => {
    const result = await appendCanvasDirectorCapture(workbench, activeNode, file, metadata);
    activeNode = result.node;
    return result.capture;
  };

  const appendCapture = async (captures) => {
    for (const capture of captures) {
      const fileName = String(capture.fileName ?? "").trim() || "director-desk-capture.png";
      const directorArtifactKind = /panorama|全景/i.test(fileName) ? "panorama" : "screenshot";
      await appendFile(dataUrlToFile(capture.dataUrl, fileName), { directorArtifactKind });
    }
    notify(`已回写 ${captures.length} 个导演台结果`, "success");
  };

  const appendVideoCapture = async (file) => {
    try {
      await appendFile(file, { media: "reference-video", directorArtifactKind: "video" });
      notify("已回写导演台参考视频", "success");
    } catch (error) {
      notify("导演台参考视频回写失败，请稍后重试");
      throw error;
    }
  };

  const open = async (node) => {
    if (disposed || !node || node.type !== "ai-director") return false;
    close();
    let binding;
    try {
      binding = await ensureDirectorDeskNodeBinding(workbench, node);
    } catch (error) {
      notify(error?.message === "canvas_director_assignment_required"
        ? "当前子账户未分配可用导演台，请联系管理员分配"
        : "导演台创建或绑定失败，请检查权限与画布保存状态");
      console.error("[new-canvas] director desk binding failed", error);
      return false;
    }
    activeNode = binding.node;
    host = document.createElement("div");
    host.dataset.canvasDirectorDeskOverlay = "true";
    host.style.cssText = "position:fixed;inset:0;z-index:1000;background:#101211;min-width:0;min-height:0;";
    surface.append(host);
    try {
      module = await loadDirectorDeskModule();
      if (disposed || !host?.isConnected) return false;
      module.mountDirectorDesk(host, {
        instanceId: binding.directorDeskKey,
        entryMode: "canvas",
        initialScreen: "editor",
        theme: resolveTheme(workbench),
        authenticated: true,
        canManageDesks: false,
        onClose: close,
        onNotify: notify,
        onUploadPanorama: (file) => uploadCanvasDirectorPanorama(workbench, file),
        onCapture: appendCapture,
        onVideoCapture: appendVideoCapture,
      });
      return true;
    } catch (error) {
      notify("导演台加载失败，请稍后重试");
      close();
      console.error("[new-canvas] director desk load failed", error);
      return false;
    }
  };

  return {
    open,
    async syncCurrentFrame(node) {
      if (!host || !activeNode || activeNode.id !== node?.id) {
        const opened = await open(node);
        if (!opened) return false;
      }
      if (typeof module?.captureDirectorDeskFrame !== "function") {
        notify("当前导演台尚未准备好，请稍后重试");
        return false;
      }
      try {
        await waitForCaptureReady();
        return true;
      } catch (error) {
        notify(error?.message === "Viewport capture handler is not registered"
          ? "当前导演台尚未准备好，请稍后重试"
          : "当前帧同步失败，请稍后重试");
        return false;
      }
    },
    async exportReferenceVideo(node) {
      if (!host || !activeNode || activeNode.id !== node?.id) {
        const opened = await open(node);
        if (!opened) return false;
      }
      if (typeof module?.exportDirectorDeskReferenceVideo !== "function") {
        notify("当前导演台不支持参考视频导出");
        return false;
      }
      try {
        await waitForVideoExportReady();
        return true;
      } catch (error) {
        notify(error?.message || "参考视频导出失败，请稍后重试");
        return false;
      }
    },
    close,
    dispose() {
      disposed = true;
      close();
    },
  };
}
