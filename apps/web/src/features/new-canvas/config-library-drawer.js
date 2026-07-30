import { upsertCanvasPromptReference } from "../production-workbench/canvas/canvas-prompt-reference.js";
import { resolveCanvasModelOptions } from "../production-workbench/canvas/canvas-state.js";

export function ensureCanvasConfigLibraryState(ui = {}) {
  const previous = ui.canvasConfigLibrary && typeof ui.canvasConfigLibrary === "object"
    ? ui.canvasConfigLibrary
    : {};
  Object.assign(previous, {
    open: false,
    loading: false,
    busyAction: "",
    type: "",
    configs: [],
    selectedConfigId: "",
    versions: [],
    selectedVersionId: "",
    importName: "",
    importManifest: "{}",
    settings: null,
    settingsLoading: false,
    settingsError: "",
    styleReferenceAssets: [],
    styleReferenceUploading: false,
    storageHealth: null,
    storageHealthLoading: false,
    storageHealthError: "",
    error: "",
    ...previous,
  });
  const referenceAssets = Array.isArray(ui.canvasAssets) ? ui.canvasAssets : [];
  previous.styleReferenceAssets = referenceAssets;
  if (!previous.settings && ui.canvasSettingsRecord?.settings) previous.settings = ui.canvasSettingsRecord;
  ui.canvasConfigLibrary = previous;
  return previous;
}

export function renderCanvasConfigLibraryShell(ui = {}) {
  const state = ensureCanvasConfigLibraryState(ui);
  return `
    <div class="canvas-config-library-shell" data-canvas-config-library>
      ${state.open ? renderDrawer(state, ui) : ""}
    </div>
  `;
}

export function createCanvasConfigLibraryController({ surface, workbench }) {
  const state = ensureCanvasConfigLibraryState(workbench.ui ?? (workbench.ui = {}));
  let disposed = false;
  const sync = () => {
    const current = surface.querySelector?.("[data-canvas-config-library]");
    if (!current || typeof document === "undefined") return false;
    const template = document.createElement("template");
    template.innerHTML = renderCanvasConfigLibraryShell(workbench.ui);
    const next = template.content.firstElementChild;
    if (!next) return false;
    current.replaceWith(next);
    return true;
  };
  const run = async (action, operation) => {
    if (state.busyAction) return;
    state.busyAction = action;
    state.error = "";
    sync();
    try {
      await operation();
    } catch (error) {
      state.error = String(error?.message ?? error ?? "配置库请求失败");
    } finally {
      state.busyAction = "";
      sync();
    }
  };
  const load = async () => {
    if (typeof workbench.api?.listCanvasUserConfigs !== "function") {
      state.error = "配置库接口暂不可用";
      sync();
      return;
    }
    state.loading = true;
    sync();
    try {
      const payload = await workbench.api.listCanvasUserConfigs({
        type: state.type || undefined,
        includeArchived: false,
        limit: 100,
      });
      state.configs = Array.isArray(payload?.configs) ? payload.configs : [];
      if (!state.configs.some((item) => String(item?.id) === state.selectedConfigId)) {
        state.selectedConfigId = String(state.configs[0]?.id ?? "");
      }
      if (state.selectedConfigId) await select(state.selectedConfigId);
    } finally {
      state.loading = false;
      sync();
    }
  };
  const select = async (configId) => {
    state.selectedConfigId = String(configId ?? "");
    state.versions = [];
    state.selectedVersionId = "";
    if (!state.selectedConfigId || typeof workbench.api?.listCanvasUserConfigVersions !== "function") {
      sync();
      return;
    }
    const payload = await workbench.api.listCanvasUserConfigVersions(state.selectedConfigId, { limit: 100 });
    state.versions = Array.isArray(payload?.versions) ? payload.versions : [];
    state.selectedVersionId = String(state.versions[0]?.id ?? "");
    sync();
  };
  const loadSettings = async () => {
    const canvasId = String(workbench.ui.selectedCanvasProjectId ?? "");
    if (!canvasId || typeof workbench.api?.getCanvasSettings !== "function") return;
    state.settingsLoading = true;
    state.settingsError = "";
    sync();
    try {
      const payload = await workbench.api.getCanvasSettings(canvasId);
      state.settings = payload?.settings ? payload : payload?.data?.settings ? payload.data : payload;
      workbench.ui.canvasSettingsRecord = state.settings;
      applyBackground();
    } catch (error) {
      state.settingsError = String(error?.message ?? error ?? "画布设置读取失败");
    } finally {
      state.settingsLoading = false;
      sync();
    }
  };
  const saveSettings = async () => {
    const canvasId = String(workbench.ui.selectedCanvasProjectId ?? "");
    if (!canvasId || !state.settings || typeof workbench.api?.updateCanvasSettings !== "function") {
      throw new Error("画布设置接口暂不可用");
    }
    const settings = state.settings.settings ?? {};
    const payload = await workbench.api.updateCanvasSettings(canvasId, {
      expectedRevision: Number(state.settings.revision ?? 1),
      patch: {
        appearance: settings.appearance,
        visualStyle: settings.visualStyle,
        promptSuffixes: settings.promptSuffixes,
        defaultModels: settings.defaultModels,
        generation: settings.generation,
      },
    });
    state.settings = payload?.settings ? payload : payload?.data?.settings ? payload.data : payload;
    workbench.ui.canvasSettingsRecord = state.settings;
  };
  const loadStorageHealth = async () => {
    const canvasId = String(workbench.ui.selectedCanvasProjectId ?? "");
    if (!canvasId || typeof workbench.api?.getCanvasStorageHealth !== "function") return;
    state.storageHealthLoading = true;
    state.storageHealthError = "";
    sync();
    try {
      const payload = await workbench.api.getCanvasStorageHealth(canvasId);
      state.storageHealth = payload?.health ?? payload?.data?.health ?? payload ?? null;
    } catch (error) {
      state.storageHealthError = String(error?.message ?? error ?? "存储健康读取失败");
    } finally {
      state.storageHealthLoading = false;
      sync();
    }
  };
  const addStyleReferenceAsset = (asset) => {
    const assetId = String(asset?.assetId ?? "").trim();
    const assetVersionId = String(asset?.assetVersionId ?? "").trim();
    if (!assetId || !assetVersionId) throw new Error("风格母图物化结果不完整");
    const current = Array.isArray(workbench.ui.canvasAssets) ? workbench.ui.canvasAssets : [];
    workbench.ui.canvasAssets = [
      asset,
      ...current.filter((item) => String(item?.assetId ?? "").trim() !== assetId),
    ];
    state.styleReferenceAssets = workbench.ui.canvasAssets;
  };
  return {
    handleInput(target) {
      if (target?.dataset?.canvasStyleReferenceFile !== undefined) {
        const file = target.files?.[0];
        if (!file || state.styleReferenceUploading) return true;
        if (!String(file.type ?? "").toLowerCase().startsWith("image/")) {
          state.error = "请选择图片文件";
          sync();
          return true;
        }
        if (Number(file.size ?? 0) <= 0 || Number(file.size) > 20 * 1024 * 1024) {
          state.error = "风格母图大小需在 20 MB 以内";
          sync();
          return true;
        }
        const canvasId = String(workbench.ui.selectedCanvasProjectId ?? "").trim();
        if (!canvasId || typeof workbench.api?.uploadFile !== "function" || typeof workbench.api?.materializeCanvasStyleReferenceAsset !== "function") {
          state.error = "风格母图上传接口暂不可用";
          sync();
          return true;
        }
        state.styleReferenceUploading = true;
        void run("style-reference-upload", async () => {
          const uploaded = await workbench.api.uploadFile(file, {
            purpose: "new-canvas/style-reference",
            projectId: null,
            idempotencyKey: `canvas-style-reference:${canvasId}:${file.name}:${file.size}:${file.lastModified ?? 0}`,
          });
          const upload = uploaded?.upload ?? {};
          const materialized = await workbench.api.materializeCanvasStyleReferenceAsset(canvasId, {
            uploadSessionId: String(upload.uploadSessionId ?? ""),
            storageObjectId: String(upload.storageObjectId ?? ""),
            label: file.name,
          });
          const asset = materialized?.asset ?? materialized?.data?.asset;
          addStyleReferenceAsset(asset);
          state.settings.settings = {
            ...state.settings.settings,
            visualStyle: {
              ...(state.settings.settings.visualStyle ?? {}),
              styleReferenceAssetId: asset.assetId,
              styleReferenceEnabled: true,
            },
          };
          await saveSettings();
        }).finally(() => {
          state.styleReferenceUploading = false;
          try { target.value = ""; } catch { /* File inputs may be read-only in test DOMs. */ }
          sync();
        });
        return true;
      }
      const settingPath = String(target?.dataset?.canvasSetting ?? "");
      if (settingPath && state.settings?.settings) {
        const [section, key] = settingPath.split(".");
        if (section && key && state.settings.settings[section] && typeof state.settings.settings[section] === "object") {
          const value = target.type === "checkbox"
            ? Boolean(target.checked)
            : target.type === "number" ? Number(target.value) : String(target.value ?? "");
          state.settings.settings = {
            ...state.settings.settings,
            [section]: { ...state.settings.settings[section], [key]: value },
          };
          return true;
        }
      }
      const field = String(target?.dataset?.configField ?? "");
      if (!field || !Object.hasOwn(state, field)) return false;
      state[field] = String(target.value ?? "");
      if (field === "type") void run("load", load);
      return true;
    },
    async handleAction(target) {
      const action = String(target?.dataset?.configAction ?? "");
      if (!action) return false;
      if (action === "open") {
        state.open = true;
        sync();
        await run("load", load);
        await Promise.all([loadSettings(), loadStorageHealth()]);
        return true;
      }
      if (action === "close") {
        state.open = false;
        sync();
        return true;
      }
      if (action === "select") {
        await run("select", () => select(target.dataset.configId));
        return true;
      }
      if (action === "create") {
        await run("create", async () => {
          const name = state.importName.trim();
          if (!name) throw new Error("请输入配置名称");
          let manifest;
          try { manifest = JSON.parse(state.importManifest); } catch { throw new Error("配置 JSON 格式不正确"); }
          if (!state.type) throw new Error("请选择配置类型");
          await workbench.api.createCanvasUserConfig({ type: state.type, name, manifest });
          state.importName = "";
          state.importManifest = "{}";
          await load();
        });
        return true;
      }
      if (action === "apply") {
        const config = state.configs.find((item) => String(item?.id) === state.selectedConfigId);
        const version = state.versions.find((item) => String(item?.id) === state.selectedVersionId);
        if (!config || !version) {
          state.error = "请选择配置版本";
          sync();
          return true;
        }
        const snapshots = workbench.ui.canvasConfigSnapshots && typeof workbench.ui.canvasConfigSnapshots === "object"
          ? workbench.ui.canvasConfigSnapshots
          : {};
        snapshots[config.type] = { configId: config.id, versionId: version.id, version: version.version, manifest: version.manifest };
        workbench.ui.canvasConfigSnapshots = snapshots;
        const manifest = version.manifest && typeof version.manifest === "object" ? version.manifest : {};
        const referenceType = config.type === "style" || config.type === "skill" ? config.type : "";
        const directiveType = config.type === "slash_command" ? "slashCommands" : config.type === "preset" ? "presets" : "";
        const nextDocument = config.type === "toolbar"
          ? {
              ...workbench.ui.canvasDocument,
              configReferences: {
                ...(workbench.ui.canvasDocument?.configReferences ?? {}),
                toolbar: {
                  configId: config.id,
                  versionId: version.id,
                  version: Number(version.version ?? 1),
                },
              },
            }
          : directiveType
          ? {
              ...workbench.ui.canvasDocument,
              promptDirectives: {
                schemaVersion: 1,
                slashCommands: Array.isArray(workbench.ui.canvasDocument?.promptDirectives?.slashCommands)
                  ? workbench.ui.canvasDocument.promptDirectives.slashCommands.slice()
                  : [],
                presets: Array.isArray(workbench.ui.canvasDocument?.promptDirectives?.presets)
                  ? workbench.ui.canvasDocument.promptDirectives.presets.slice()
                  : [],
                suffixes: Array.isArray(workbench.ui.canvasDocument?.promptDirectives?.suffixes)
                  ? workbench.ui.canvasDocument.promptDirectives.suffixes.slice()
                  : [],
                [directiveType]: [
                  ...(Array.isArray(workbench.ui.canvasDocument?.promptDirectives?.[directiveType])
                    ? workbench.ui.canvasDocument.promptDirectives[directiveType].filter((item) => String(item?.id) !== String(config.id))
                    : []),
                  { id: config.id, version: String(version.version ?? version.id) },
                ],
              },
            }
          : referenceType
          ? upsertCanvasPromptReference(workbench.ui.canvasDocument, referenceType, {
              id: config.id,
              version: version.version ?? version.id,
              status: "active",
              content: manifest.content ?? manifest.prompt ?? manifest.text ?? manifest.value ?? JSON.stringify(manifest),
              configId: config.id,
              versionId: version.id,
            })
          : workbench.ui.canvasDocument;
        workbench.ui.canvasDocument = nextDocument;
        workbench.updateCanvasDocument?.(nextDocument);
        state.error = "";
        sync();
        await workbench.refreshCanvasSurface?.();
        return true;
      }
      if (action === "new-version") {
        await run("version", async () => {
          const config = state.configs.find((item) => String(item?.id) === state.selectedConfigId);
          if (!config) throw new Error("请选择配置");
          let manifest;
          try { manifest = JSON.parse(state.importManifest); } catch { throw new Error("配置 JSON 格式不正确"); }
          await workbench.api.createCanvasUserConfigVersion(config.id, { manifest });
          await select(config.id);
        });
        return true;
      }
      if (action === "archive") {
        await run("archive", async () => {
          if (!state.selectedConfigId) throw new Error("请选择配置");
          await workbench.api.archiveCanvasUserConfig(state.selectedConfigId);
          state.selectedConfigId = "";
          state.versions = [];
          await load();
        });
        return true;
      }
      if (action === "save-settings") {
        await run("settings", saveSettings);
        return true;
      }
      if (action === "upload-style-reference") {
        surface.querySelector?.("[data-canvas-style-reference-file]")?.click?.();
        return true;
      }
      if (action === "refresh-storage-health") {
        await loadStorageHealth();
        return true;
      }
      return false;
    },
    dispose() { disposed = true; },
    get disposed() { return disposed; },
  };
}

function renderDrawer(state, ui = {}) {
  const busy = Boolean(state.busyAction);
  const selected = state.configs.find((item) => String(item?.id) === state.selectedConfigId);
  return `
    <aside class="canvas-config-library-drawer" aria-label="用户配置库">
      <header><div><span>CANVAS</span><strong>配置库</strong></div><button type="button" data-config-action="close" aria-label="关闭">×</button></header>
      <label>类型<select data-config-field="type"><option value="">全部</option><option value="style" ${state.type === "style" ? "selected" : ""}>画风</option><option value="skill" ${state.type === "skill" ? "selected" : ""}>Skill</option><option value="toolbar" ${state.type === "toolbar" ? "selected" : ""}>工具栏</option><option value="slash_command" ${state.type === "slash_command" ? "selected" : ""}>斜杠命令</option><option value="preset" ${state.type === "preset" ? "selected" : ""}>提示词预设</option></select></label>
      <section class="canvas-config-create">
        <input data-config-field="importName" value="${escapeAttr(state.importName)}" placeholder="配置名称" />
        <textarea data-config-field="importManifest" placeholder="配置 JSON">${escapeHtml(state.importManifest)}</textarea>
        <button type="button" data-config-action="create" ${busy ? "disabled" : ""}>创建不可变配置</button>
      </section>
      ${renderCanvasSettings(state, ui)}
      ${renderCanvasStorageHealth(state)}
      <section class="canvas-config-list" aria-label="配置列表">
        ${state.loading ? "<p>正在加载...</p>" : state.configs.length ? state.configs.map((item) => `
          <button type="button" class="${String(item.id) === state.selectedConfigId ? "active" : ""}" data-config-action="select" data-config-id="${escapeAttr(item.id)}"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.type)}</span></button>
        `).join("") : "<p>暂无配置</p>"}
      </section>
      ${selected ? `<section class="canvas-config-versions"><strong>${escapeHtml(selected.name)}</strong><select data-config-field="selectedVersionId">${state.versions.map((version) => `<option value="${escapeAttr(version.id)}" ${String(version.id) === state.selectedVersionId ? "selected" : ""}>v${escapeHtml(version.version)}</option>`).join("")}</select><button type="button" data-config-action="apply" ${!state.selectedVersionId ? "disabled" : ""}>应用到当前画布</button><button type="button" data-config-action="new-version" ${busy ? "disabled" : ""}>创建新版本</button><button type="button" data-config-action="archive" ${busy ? "disabled" : ""}>归档配置</button></section>` : ""}
      ${state.error ? `<p class="canvas-config-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
    </aside>
  `;
}

function renderCanvasSettings(state, ui = {}) {
  const record = state.settings;
  const settings = record?.settings ?? {};
  const style = settings.visualStyle ?? {};
  const suffixes = settings.promptSuffixes ?? {};
  const models = settings.defaultModels ?? {};
  const generation = settings.generation ?? {};
  const limits = record?.limits ?? {};
  const documentLimits = limits.document ?? {};
  const generationLimits = limits.generation ?? {};
  const styleConfigs = state.configs.filter((item) => item?.type === "style");
  const styleReferenceOptions = resolveStyleReferenceOptions(state.styleReferenceAssets);
  const selectedStyleReference = styleReferenceOptions.find((asset) => asset.id === String(style.styleReferenceAssetId ?? "")) ?? null;
  return `<section class="canvas-default-settings" aria-label="画布默认设置">
    <header><strong>画布默认设置</strong>${record?.revision ? `<small>修订 ${escapeHtml(record.revision)}</small>` : ""}</header>
    ${state.settingsLoading ? `<p>正在读取画布设置...</p>` : record ? `
      ${styleConfigs.length ? `<label>已保存画风<select data-canvas-setting="visualStyle.styleId"><option value="">跟随节点</option>${styleConfigs.map((item) => `<option value="${escapeAttr(item.id)}" ${String(item.id) === String(style.styleId ?? "") ? "selected" : ""}>${escapeHtml(item.name ?? item.id)}</option>`).join("")}</select></label>` : ""}
      <label>画风 ID<input data-canvas-setting="visualStyle.styleId" value="${escapeAttr(style.styleId ?? "")}" placeholder="稳定画风 ID" /></label>
      <label>画风提示词<textarea data-canvas-setting="visualStyle.prompt" rows="2" placeholder="可选的画风提示词">${escapeHtml(style.prompt ?? "")}</textarea></label>
      <section class="canvas-style-reference-settings" aria-label="风格母图">
        <header><div><strong>风格母图</strong><small>图片和视频生成会参考此资产</small></div>${selectedStyleReference ? `<label class="canvas-setting-toggle"><input type="checkbox" data-canvas-setting="visualStyle.styleReferenceEnabled" ${style.styleReferenceEnabled !== false ? "checked" : ""} />启用</label>` : ""}</header>
        <div class="canvas-style-reference-controls"><label>资产<select data-canvas-setting="visualStyle.styleReferenceAssetId" ${style.styleReferenceEnabled === false ? "disabled" : ""}><option value="">不使用</option>${styleReferenceOptions.map((asset) => `<option value="${escapeAttr(asset.id)}" ${String(asset.id) === String(style.styleReferenceAssetId ?? "") ? "selected" : ""}>${escapeHtml(asset.label)}</option>`).join("")}</select></label><button type="button" data-config-action="upload-style-reference" ${state.styleReferenceUploading || state.busyAction ? "disabled" : ""}>${state.styleReferenceUploading ? "上传中..." : "上传图片"}</button><input type="file" accept="image/*" data-canvas-style-reference-file hidden /></div>
        ${renderStyleReferencePreview(selectedStyleReference, style.styleReferenceEnabled !== false)}
      </section>
      <label class="canvas-setting-toggle"><input type="checkbox" data-canvas-setting="visualStyle.locked" ${style.locked === true ? "checked" : ""} />锁定画风，生成时不跟随节点覆盖</label>
      <dl class="canvas-product-limits" aria-label="画布配额策略">
        <div><dt>文档</dt><dd>${escapeHtml(formatBytes(documentLimits.maximumBytes ?? 0))}</dd></div>
        <div><dt>节点</dt><dd>${escapeHtml(documentLimits.maximumNodes ?? "-")}</dd></div>
        <div><dt>连接</dt><dd>${escapeHtml(documentLimits.maximumEdges ?? "-")}</dd></div>
        <div><dt>单批运行</dt><dd>${escapeHtml(generationLimits.maximumBatchNodes ?? "-")} 节点</dd></div>
        <div><dt>计费</dt><dd>沿用当前账号积分</dd></div>
        <div><dt>模型限制</dt><dd>按后台启用模型</dd></div>
      </dl>
      <div class="canvas-settings-grid">
        ${["text", "image", "video", "audio"].map((kind) => `<label>${kind} 后缀<input data-canvas-setting="promptSuffixes.${kind}" value="${escapeAttr(suffixes[kind] ?? "")}" /></label>`).join("")}
        ${["text", "audio"].map((kind) => `<label>${kind} 默认模型<input data-canvas-setting="defaultModels.${kind}" value="${escapeAttr(models[kind] ?? "")}" /></label>`).join("")}
        ${["image", "video"].map((kind) => renderDefaultModelSelect(kind, models[kind], ui.episodeGenerationConfig)).join("")}
      </div>
      <div class="canvas-output-defaults" aria-label="输出默认">
        <article>
          <header><strong>图片输出</strong><small>比例与画质</small></header>
          <label class="canvas-setting-toggle"><input type="checkbox" data-canvas-setting="generation.imageFollowNode" ${generation.imageFollowNode === true ? "checked" : ""} />跟随节点默认值</label>
          <label>比例<select data-canvas-setting="generation.imageAspectRatio" ${generation.imageFollowNode === true ? "disabled" : ""}>${renderSettingOptions(generation.imageAspectRatio ?? "1:1", ["1:1", "4:3", "3:4", "16:9", "9:16"])}</select></label>
          <label>画质<select data-canvas-setting="generation.imageSize" ${generation.imageFollowNode === true ? "disabled" : ""}>${renderSettingOptions(generation.imageSize ?? "1K", ["1K", "2K", "4K"])}</select></label>
        </article>
        <article>
          <header><strong>视频输出</strong><small>分辨率与时长</small></header>
          <label class="canvas-setting-toggle"><input type="checkbox" data-canvas-setting="generation.videoFollowNode" ${generation.videoFollowNode === true ? "checked" : ""} />跟随节点默认值</label>
          <label>分辨率<select data-canvas-setting="generation.videoResolution" ${generation.videoFollowNode === true ? "disabled" : ""}>${renderSettingOptions(generation.videoResolution ?? "720p", ["480p", "720p", "1080p", "2K", "4K"])}</select></label>
          <label>时长<input type="number" min="1" max="3600" data-canvas-setting="generation.videoDuration" value="${escapeAttr(generation.videoDuration ?? 5)}" ${generation.videoFollowNode === true ? "disabled" : ""} /></label>
        </article>
      </div>
      <button type="button" data-config-action="save-settings" ${state.busyAction ? "disabled" : ""}>保存画布默认设置</button>
    ` : `<p>打开画布后可编辑默认设置。</p>`}
    ${state.settingsError ? `<p class="canvas-config-error" role="alert">${escapeHtml(state.settingsError)}</p>` : ""}
  </section>`;
}

function renderDefaultModelSelect(kind, selectedCode, generationConfig) {
  const selected = String(selectedCode ?? "").trim();
  const groups = new Map();
  for (const model of resolveCanvasModelOptions(generationConfig, kind)) {
    const code = String(model?.modelCode ?? "").trim();
    if (!code) continue;
    const provider = String(model?.raw?.providerGroup ?? model?.raw?.group ?? model?.raw?.providerName ?? "后台配置").trim() || "后台配置";
    const label = String(model?.modelLabel ?? code).trim() || code;
    const options = groups.get(provider) ?? [];
    if (!options.some((option) => option.code === code)) options.push({ code, label });
    groups.set(provider, options);
  }
  const activeCodes = new Set([...groups.values()].flatMap((options) => options.map((option) => option.code)));
  const options = ["<option value=\"\">跟随节点</option>"];
  if (selected && !activeCodes.has(selected)) {
    options.push(`<optgroup label="当前不可用"><option value="${escapeAttr(selected)}" selected disabled>${escapeHtml(`已保存但当前不可用：${selected}`)}</option></optgroup>`);
  }
  for (const [provider, items] of groups) {
    options.push(`<optgroup label="${escapeAttr(provider)}">${items.map((item) => `<option value="${escapeAttr(item.code)}" ${item.code === selected ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}</optgroup>`);
  }
  if (!groups.size && !selected) {
    options.push("<option value=\"\" disabled>未加载后台模型</option>");
  }
  return `<label>${escapeHtml(kind)} 默认模型<select data-canvas-setting="defaultModels.${escapeAttr(kind)}">${options.join("")}</select></label>`;
}

function resolveStyleReferenceOptions(assets = []) {
  const seen = new Set();
  return (Array.isArray(assets) ? assets : []).flatMap((asset) => {
    const id = String(asset?.assetId ?? "").trim();
    const assetVersionId = String(asset?.assetVersionId ?? "").trim();
    if (!id || !assetVersionId || seen.has(id)) return [];
    seen.add(id);
    return [{
      id,
      label: String(asset?.title ?? asset?.name ?? asset?.meta ?? id),
      previewUrl: String(asset?.previewUrl ?? asset?.url ?? "").trim(),
    }];
  });
}

function renderStyleReferencePreview(asset, enabled) {
  if (!asset) return "";
  const preview = String(asset.previewUrl ?? "").trim();
  return `<section class="canvas-style-reference-preview${enabled ? "" : " is-disabled"}" aria-label="当前风格母图">
    ${preview ? `<img src="${escapeAttr(preview)}" alt="" loading="lazy" />` : "<span class=\"canvas-style-reference-preview-fallback\">风格</span>"}
    <div><strong>${escapeHtml(asset.label)}</strong><small>${enabled ? "生成时作为参考图" : "已暂停使用，资产保留"}</small></div>
  </section>`;
}

function renderSettingOptions(selectedValue, options) {
  const selected = String(selectedValue ?? "");
  const values = options.includes(selected) ? options : [selected, ...options].filter(Boolean);
  return values.map((value) => `<option value="${escapeAttr(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
}

function renderCanvasStorageHealth(state) {
  const health = state.storageHealth;
  const status = health?.status === "healthy" ? "健康" : health?.status === "degraded" ? "异常" : health ? "需关注" : "未检查";
  return `<section class="canvas-storage-health" aria-label="存储健康">
    <header><strong>存储健康</strong><button type="button" data-config-action="refresh-storage-health" ${state.storageHealthLoading ? "disabled" : ""}>刷新</button></header>
    ${state.storageHealthLoading ? "<p>正在检查...</p>" : health ? `<div class="canvas-storage-health-summary" data-health-status="${escapeAttr(health.status)}">
      <span>${status}</span>
      <dl>
        <div><dt>对象</dt><dd>${escapeHtml(health.objects?.count ?? 0)}</dd></div>
        <div><dt>容量</dt><dd>${escapeHtml(formatBytes(health.objects?.totalBytes ?? 0))}</dd></div>
        <div><dt>失败</dt><dd>${escapeHtml(health.objects?.failedCount ?? 0)}</dd></div>
        <div><dt>孤立</dt><dd>${escapeHtml(health.orphaned?.count ?? 0)}</dd></div>
        <div><dt>复用上传</dt><dd>${escapeHtml(health.fingerprints?.avoidedUploadCount ?? 0)}</dd></div>
        <div><dt>缺失缩略图</dt><dd>${escapeHtml(health.thumbnails?.missingCount ?? 0)}</dd></div>
      </dl>
    </div>` : "<p>点击刷新检查当前画布的对象存储。</p>"}
    ${state.storageHealthError ? `<p class="canvas-config-error" role="alert">${escapeHtml(state.storageHealthError)}</p>` : ""}
  </section>`;
}

function formatBytes(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
function escapeAttr(value) { return escapeHtml(value).replaceAll("`", "&#96;"); }
