import {
  CANVAS_TOOL_PRESETS,
  listCanvasToolPresets,
  normalizeCanvasUserToolPreset,
  useCanvasToolPreset,
} from "./canvas-tool-presets.js";
import { filterCanvasToolPresets } from "./canvas-workflow-templates.js";
import { createCanvasToolPresetLazyLoader } from "./canvas-tool-preset-loader.js";

export const CANVAS_TOOL_PRESET_DRAG_TYPE = "application/x-loomic-canvas-tool-preset";
const catalogCache = new WeakMap();

function responseItems(payload, key) {
  const source = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  return Array.isArray(source?.[key]) ? source[key] : Array.isArray(source?.items) ? source.items : [];
}

function responsePreset(payload) {
  const source = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  return source?.preset ?? source;
}

function responseVersion(payload) {
  const source = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  return source?.version ?? source?.currentVersion ?? source;
}

export function canvasToolPresetToResourceEntry(preset) {
  const user = preset?.source === "user";
  return {
    ...preset,
    id: String(preset?.id ?? "").trim(),
    title: String(preset?.title ?? preset?.name ?? "未命名工具").trim() || "未命名工具",
    source: user ? "user" : "builtin",
    sourceLabel: user ? "用户工具" : "画布工具",
    resourceType: "tool",
    resourceCategory: "tool",
    type: "tool",
    kindLabel: user ? "用户工具" : (preset?.categoryLabel || "工作流预设"),
    description: String(preset?.description ?? "").trim(),
  };
}

export function createCanvasToolPresetCatalog(client) {
  const loader = createCanvasToolPresetLazyLoader({
    loadDetail: async (presetId) => {
      const detail = responsePreset(await client.getToolPreset(presetId));
      if (!normalizeCanvasUserToolPreset(detail)?.topology?.nodes?.length) {
        throw new Error("工具详情缺少可执行拓扑");
      }
      return detail;
    },
    loadVersions: async (presetId) => responseItems(await client.listToolPresetVersions(presetId), "versions"),
  });

  const loadUsers = async () => {
    const payload = await client.listToolPresets();
    return responseItems(payload, "items")
      .filter((preset) => preset?.status !== "archived")
      .map((preset) => normalizeCanvasUserToolPreset(preset))
      .filter(Boolean);
  };

  const ensureDetail = async (preset) => {
    if (!preset || preset.source !== "user" || preset.topology?.nodes?.length) return preset;
    const detail = normalizeCanvasUserToolPreset({ ...preset, ...await loader.loadDetail(preset.id) });
    if (!detail?.topology?.nodes?.length) throw new Error("工具详情缺少可执行拓扑");
    return detail;
  };

  return {
    listBuiltins(options = {}) {
      return listCanvasToolPresets(options);
    },
    async listUsers(options = {}) {
      return filterCanvasToolPresets(await loadUsers(), options);
    },
    async list(options = {}) {
      const users = filterCanvasToolPresets(await loadUsers(), options);
      return [...users, ...listCanvasToolPresets(options)];
    },
    async loadById(presetId) {
      const id = String(presetId ?? "").trim();
      const builtin = CANVAS_TOOL_PRESETS.find((preset) => preset.id === id);
      if (builtin) return builtin;
      const detail = normalizeCanvasUserToolPreset(await loader.loadDetail(id));
      if (!detail?.topology?.nodes?.length) throw new Error("工具详情缺少可执行拓扑");
      return detail;
    },
    ensureDetail,
    async reloadDetail(preset) {
      if (!preset?.id) throw new Error("工具详情缺少标识");
      loader.remove(preset.id);
      return ensureDetail({ ...preset, topology: null });
    },
    async loadVersions(preset) {
      if (!preset || preset.source !== "user") return { detail: preset, versions: [] };
      const [detail, versions] = await Promise.all([ensureDetail(preset), loader.loadVersions(preset.id)]);
      return { detail, versions: versions.length ? versions : [{ versionNumber: detail.currentVersionNumber }] };
    },
    async selectVersion(preset, versionNumber) {
      const selectedVersion = Number(versionNumber);
      if (!Number.isFinite(selectedVersion)) throw new Error("工具版本无效");
      const response = await client.getToolPresetVersion(preset.id, selectedVersion);
      const selected = normalizeCanvasUserToolPreset(preset, responseVersion(response));
      if (!selected?.topology?.nodes?.length) throw new Error("工具版本缺少可执行拓扑");
      loader.seedDetail(preset.id, selected);
      return selected;
    },
    async insert(api, preset, options = {}) {
      const shouldInsert = typeof options.shouldInsert === "function" ? options.shouldInsert : () => true;
      if (!shouldInsert()) return { ok: false, reason: "stale_scope", elementIds: [] };
      const executable = await ensureDetail(preset);
      if (!shouldInsert()) return { ok: false, reason: "stale_scope", elementIds: [] };
      if (!executable) return { ok: false, reason: "template_not_found", elementIds: [] };
      return executable.source === "user"
        ? useCanvasToolPreset(api, executable, options)
        : useCanvasToolPreset(api, executable.id, options);
    },
    seedDetail: loader.seedDetail,
    seedVersions: loader.seedVersions,
    invalidateVersions: loader.invalidateVersions,
    remove: loader.remove,
  };
}

export function getCanvasToolPresetCatalog(client) {
  if (!client || (typeof client !== "object" && typeof client !== "function")) return createCanvasToolPresetCatalog(client);
  if (!catalogCache.has(client)) catalogCache.set(client, createCanvasToolPresetCatalog(client));
  return catalogCache.get(client);
}
