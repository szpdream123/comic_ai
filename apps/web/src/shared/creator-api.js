/**
 * @typedef {"character" | "scene" | "prop"} AssetCandidateGroup
 *
 * @typedef {object} CreatorState
 * @property {object | null} project
 * @property {object | null} script
 * @property {object | null} assetReview
 * @property {object | null} assetCandidates
 * @property {object | null} calibration
 * @property {Array<object>} shots
 * @property {object | null} exportPreview
 */

async function fetchJson(url, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 10000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const { timeoutMs: _timeoutMs, ...fetchOptions } = options;

  let response;
  try {
    response = await fetch(resolveApiUrl(url), {
      credentials: "include",
      ...fetchOptions,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("request_timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(payload.error ?? `request_failed:${response.status}`);
  }

  return payload;
}

export function resolveApiUrl(url) {
  if (typeof window === "undefined") {
    return url;
  }
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  const origin =
    window.location.protocol === "file:"
      ? "http://127.0.0.1:4310"
      : window.location.origin;
  return new URL(url, origin).toString();
}

function postJson(url, body) {
  return fetchJson(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

async function postMultipart(url, formData) {
  return fetchJson(url, {
    method: "POST",
    body: formData,
  });
}

function patchJson(url, body) {
  return fetchJson(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

function deleteJson(url, body) {
  return fetchJson(url, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

export const creatorApi = {
  getSession() {
    return fetchJson("/api/auth/session");
  },

  logout() {
    return postJson("/api/auth/logout");
  },

  getCreatorState() {
    return fetchJson("/api/creator/state");
  },

  createProject(input) {
    return postJson("/api/creator/project/create", input);
  },

  getProjects() {
    return fetchJson("/api/creator/projects");
  },

  getProjectDetail(projectId) {
    return fetchJson(`/api/creator/projects/${encodeURIComponent(projectId)}/detail`);
  },

  selectProject(input) {
    return postJson("/api/creator/project/select", input);
  },

  updateProject(input) {
    return patchJson("/api/creator/project", input);
  },

  deleteProject(input) {
    return deleteJson("/api/creator/project", input);
  },

  updateProjectCover(input) {
    return postJson("/api/creator/project/cover", input);
  },

  parseScript() {
    return postJson("/api/creator/parse");
  },

  confirmAsset(input) {
    return postJson("/api/creator/assets/confirm", input);
  },

  confirmAllAssets() {
    return postJson("/api/creator/assets/confirm-all");
  },

  updateAssetLabel(input) {
    return postJson("/api/creator/assets/update-label", input);
  },

  getAssetLibrary() {
    return fetchJson("/api/creator/assets/library");
  },

  updateProjectAsset(assetId, input) {
    return patchJson(`/api/creator/assets/${encodeURIComponent(assetId)}`, input);
  },

  deleteProjectAsset(assetId) {
    return deleteJson(`/api/creator/assets/${encodeURIComponent(assetId)}`);
  },

  uploadFile(file, options = {}) {
    const formData = new FormData();
    formData.set("file", file);
    formData.set("category", options.category ?? "misc");
    if (options.projectId) {
      formData.set("projectId", options.projectId);
    }
    return postMultipart("/api/creator/uploads", formData);
  },

  importAsset(input) {
    return postJson("/api/creator/assets/import", input);
  },

  generateAsset(input) {
    return postJson("/api/creator/assets/generate", input);
  },

  getAssetVersions(assetId) {
    return fetchJson(`/api/creator/assets/versions/${encodeURIComponent(assetId)}`);
  },

  getProjectEpisodes(projectId) {
    return fetchJson(`/api/creator/projects/${encodeURIComponent(projectId)}/episodes`);
  },

  getProjectMembers(projectId) {
    return fetchJson(`/api/creator/projects/${encodeURIComponent(projectId)}/members`);
  },

  getProjectStats(projectId) {
    return fetchJson(`/api/creator/projects/${encodeURIComponent(projectId)}/stats`);
  },

  createEpisode(input) {
    return postJson("/api/creator/episodes", input);
  },

  updateEpisode(input) {
    return patchJson("/api/creator/episodes", input);
  },

  deleteEpisode(input) {
    return deleteJson("/api/creator/episodes", input);
  },

  createShot(input) {
    return postJson("/api/creator/shots", input);
  },

  updateShot(input) {
    return patchJson("/api/creator/shots", input);
  },

  importShotMedia(shotId, input) {
    return postJson(`/api/creator/shots/${encodeURIComponent(shotId)}/media/import`, input);
  },

  deleteShotMedia(shotId, input) {
    const assetVersionId = input?.assetVersionId;
    const kind = input?.kind;
    const ignoreMissingShotMedia = (error) => {
      const message = String(error instanceof Error ? error.message : error);
      if (message.includes("shot_media_not_found")) {
        return { deleted: false, missing: true };
      }
      throw error;
    };
    if (assetVersionId && kind) {
      return fetchJson(
        `/api/creator/shots/${encodeURIComponent(shotId)}/media/${encodeURIComponent(assetVersionId)}?kind=${encodeURIComponent(kind)}`,
        {
          method: "DELETE",
        },
      ).catch(ignoreMissingShotMedia);
    }
    return deleteJson(`/api/creator/shots/${encodeURIComponent(shotId)}/media`, input).catch(ignoreMissingShotMedia);
  },

  replaceShotReferences(shotId, input) {
    return postJson(`/api/creator/shots/${encodeURIComponent(shotId)}/references`, input);
  },

  deleteShot(input) {
    return deleteJson("/api/creator/shots", input);
  },

  reorderShots(input) {
    return postJson("/api/creator/shots/reorder", input);
  },

  runCalibration() {
    return postJson("/api/creator/calibration/run");
  },

  skipCalibration(input) {
    return postJson("/api/creator/calibration/skip", input);
  },

  overrideCalibration(input) {
    return postJson("/api/creator/calibration/override", input);
  },

  generateImages(input) {
    return postJson("/api/creator/images/generate", input);
  },

  generateVideos(input) {
    return postJson("/api/creator/videos/generate", input);
  },

  previewExport() {
    return postJson("/api/creator/export/preview");
  },

  getExportHistory() {
    return fetchJson("/api/creator/export/history");
  },
};
