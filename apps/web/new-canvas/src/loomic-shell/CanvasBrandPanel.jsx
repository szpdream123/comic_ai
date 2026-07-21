import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, ImagePlus, LoaderCircle, Palette, Plus, RefreshCw, Sparkles, Trash2, Type, X } from "lucide-react";
import { insertCloudAssetOnCanvas } from "./canvas-file-utils.js";
import {
  applyBrandKitBackground,
  applyBrandKitToCanvasSelection,
  brandKitAssetsByType,
  brandKitDetailFromPayload,
  brandKitListFromPayload,
  selectedBrandKitIdFromPayload,
} from "./canvas-brand-kit.js";

const ASSET_TABS = [
  ["color", "颜色", Palette],
  ["font", "字体", Type],
  ["logo", "Logo", Sparkles],
  ["image", "图片", ImagePlus],
];

const COLOR_ROLES = ["primary", "secondary", "accent", "text", "background"];
const FONT_ROLES = ["primary", "heading", "body", "caption"];
const BRAND_FONT_UPLOAD_LIMITS = {
  font: {
    label: "字体",
    maxBytes: 10 * 1024 * 1024,
    mimeTypes: ["font/ttf", "font/otf", "font/woff", "font/woff2", "application/font-sfnt", "application/octet-stream"],
    extensions: [".ttf", ".otf", ".woff", ".woff2"],
  },
  blockedExtensions: [".bat", ".cmd", ".com", ".exe", ".html", ".js", ".msi", ".ps1", ".sh"],
};

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function kitFromMutation(payload) {
  return brandKitDetailFromPayload(payload?.brandKit ?? payload?.kit ?? payload);
}

function assetFromMutation(payload) {
  return payload?.asset ?? payload;
}

function assetFileUrl(asset) {
  return text(asset?.file_url ?? asset?.fileUrl ?? asset?.signedUrl ?? asset?.url);
}

function assetStorageObjectId(asset) {
  return text(asset?.storage_object_id ?? asset?.storageObjectId);
}

function assetName(asset) {
  return text(asset?.display_name ?? asset?.displayName) || "未命名资产";
}

function patchAssetInKit(kit, asset) {
  if (!kit || !asset?.id) return kit;
  const assets = kit.assets.some((entry) => entry.id === asset.id)
    ? kit.assets.map((entry) => entry.id === asset.id ? asset : entry)
    : [...kit.assets, asset];
  return { ...kit, assets };
}

function removeAssetFromKit(kit, assetId) {
  return kit ? { ...kit, assets: kit.assets.filter((asset) => asset.id !== assetId) } : kit;
}

function AssetTextInput({ value, ariaLabel, onCommit }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <input value={draft} aria-label={ariaLabel} onChange={(event) => setDraft(event.target.value)} onBlur={() => { const next = draft.trim(); if (next && next !== value) void onCommit(next); }} />;
}

export function CanvasBrandPanel({
  api,
  assetClient,
  projectId,
  open,
  onClose,
  onActiveKitChange,
}) {
  const [kits, setKits] = useState([]);
  const [selectedKitId, setSelectedKitId] = useState("");
  const [detail, setDetail] = useState(null);
  const [activeTab, setActiveTab] = useState("color");
  const [status, setStatus] = useState(projectId ? "loading" : "unavailable");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [guidanceDraft, setGuidanceDraft] = useState("");
  const uploadInputRef = useRef(null);
  const fontUploadInputRef = useRef(null);
  const requestRef = useRef(0);

  const loadDetail = useCallback(async (kitId) => {
    if (!kitId) {
      setDetail(null);
      onActiveKitChange?.(null);
      return null;
    }
    const payload = await assetClient.getBrandKit(kitId);
    const next = brandKitDetailFromPayload(payload);
    setDetail(next);
    setNameDraft(next?.name ?? "");
    setGuidanceDraft(next?.guidance_text ?? "");
    onActiveKitChange?.(next);
    return next;
  }, [assetClient, onActiveKitChange]);

  const reload = useCallback(async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    if (!projectId || !assetClient?.getBrandKits || !assetClient?.getProjectBrandKit) {
      setStatus("unavailable");
      setKits([]);
      setSelectedKitId("");
      setDetail(null);
      onActiveKitChange?.(null);
      return;
    }
    setStatus("loading");
    setError("");
    try {
      const [kitsPayload, selectionPayload] = await Promise.all([
        assetClient.getBrandKits(),
        assetClient.getProjectBrandKit(projectId),
      ]);
      if (requestRef.current !== requestId) return;
      const nextKits = brandKitListFromPayload(kitsPayload);
      const selected = selectedBrandKitIdFromPayload(selectionPayload);
      setKits(nextKits);
      setSelectedKitId(selected);
      await loadDetail(selected);
      if (requestRef.current === requestId) setStatus("ready");
    } catch (cause) {
      if (requestRef.current !== requestId) return;
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "品牌套件加载失败。");
      onActiveKitChange?.(null);
    }
  }, [assetClient, loadDetail, onActiveKitChange, projectId]);

  useEffect(() => {
    void reload();
    return () => { requestRef.current += 1; };
  }, [reload]);

  useEffect(() => {
    if (typeof FontFace !== "function" || !document.fonts) return;
    for (const asset of brandKitAssetsByType(detail, "font")) {
      const family = text(asset.text_content ?? asset.textContent);
      const fileUrl = assetFileUrl(asset);
      if (!family || !fileUrl) continue;
      const font = new FontFace(family, `url(${JSON.stringify(fileUrl)})`);
      void font.load().then((loaded) => document.fonts.add(loaded)).catch(() => undefined);
    }
  }, [detail]);

  const chooseKit = useCallback(async (kitId) => {
    if (!projectId || busy) return;
    const nextId = text(kitId);
    setBusy("select");
    setError("");
    try {
      await assetClient.updateProjectBrandKit(projectId, { brandKitId: nextId || null });
      setSelectedKitId(nextId);
      await loadDetail(nextId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "品牌套件选择失败。");
    } finally {
      setBusy("");
    }
  }, [assetClient, busy, loadDetail, projectId]);

  const createKit = useCallback(async () => {
    const name = window.prompt("品牌套件名称", "新品牌套件")?.trim();
    if (!name || busy) return;
    setBusy("create");
    setError("");
    try {
      const created = kitFromMutation(await assetClient.createBrandKit({ name }));
      if (!created) throw new Error("品牌套件返回数据无效。");
      setKits((current) => [...current, { ...created, asset_counts: { color: 0, font: 0, logo: 0, image: 0 } }]);
      await assetClient.updateProjectBrandKit(projectId, { brandKitId: created.id });
      setSelectedKitId(created.id);
      setDetail(created);
      setNameDraft(created.name);
      setGuidanceDraft(created.guidance_text ?? "");
      onActiveKitChange?.(created);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "品牌套件创建失败。");
    } finally {
      setBusy("");
    }
  }, [assetClient, busy, onActiveKitChange, projectId]);

  const duplicateKit = useCallback(async () => {
    if (!detail || busy) return;
    setBusy("duplicate");
    setError("");
    try {
      const copy = kitFromMutation(await assetClient.duplicateBrandKit(detail.id));
      if (!copy) throw new Error("品牌套件复制结果无效。");
      await assetClient.updateProjectBrandKit(projectId, { brandKitId: copy.id });
      setSelectedKitId(copy.id);
      setDetail(copy);
      setNameDraft(copy.name);
      setGuidanceDraft(copy.guidance_text ?? "");
      onActiveKitChange?.(copy);
      const kitsPayload = await assetClient.getBrandKits();
      setKits(brandKitListFromPayload(kitsPayload));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "品牌套件复制失败。");
    } finally {
      setBusy("");
    }
  }, [assetClient, busy, detail, onActiveKitChange, projectId]);

  const deleteKit = useCallback(async () => {
    if (!detail || busy || !window.confirm(`删除品牌套件“${detail.name}”？项目会解除该品牌套件。`)) return;
    setBusy("delete");
    setError("");
    try {
      await assetClient.deleteBrandKit(detail.id);
      setDetail(null);
      setSelectedKitId("");
      onActiveKitChange?.(null);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "品牌套件删除失败。");
    } finally {
      setBusy("");
    }
  }, [assetClient, busy, detail, onActiveKitChange, reload]);

  const saveKit = useCallback(async (patch = {}) => {
    if (!detail || busy) return;
    setBusy("save");
    setError("");
    try {
      const updated = kitFromMutation(await assetClient.updateBrandKit(detail.id, {
        name: nameDraft.trim() || detail.name,
        guidance_text: guidanceDraft.trim() || null,
        ...patch,
      }));
      if (!updated) throw new Error("品牌套件保存结果无效。");
      setDetail(updated);
      setKits((current) => current.map((kit) => kit.id === updated.id ? { ...kit, name: updated.name, is_default: updated.is_default } : patch.is_default ? { ...kit, is_default: false } : kit));
      setNameDraft(updated.name);
      setGuidanceDraft(updated.guidance_text ?? "");
      onActiveKitChange?.(updated);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "品牌套件保存失败。");
    } finally {
      setBusy("");
    }
  }, [assetClient, busy, detail, guidanceDraft, nameDraft, onActiveKitChange]);

  const createAsset = useCallback(async (input) => {
    if (!detail || busy) return null;
    setBusy("asset-create");
    setError("");
    try {
      const asset = assetFromMutation(await assetClient.createBrandKitAsset(detail.id, input));
      setDetail((current) => {
        const next = patchAssetInKit(current, asset);
        onActiveKitChange?.(next);
        return next;
      });
      return asset;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "品牌资产创建失败。");
      return null;
    } finally {
      setBusy("");
    }
  }, [assetClient, busy, detail, onActiveKitChange]);

  const updateAsset = useCallback(async (assetId, input) => {
    if (!detail || busy) return;
    setBusy(`asset:${assetId}`);
    setError("");
    try {
      const asset = assetFromMutation(await assetClient.updateBrandKitAsset(detail.id, assetId, input));
      setDetail((current) => {
        const next = patchAssetInKit(current, asset);
        onActiveKitChange?.(next);
        return next;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "品牌资产保存失败。");
    } finally {
      setBusy("");
    }
  }, [assetClient, busy, detail, onActiveKitChange]);

  const deleteAsset = useCallback(async (assetId) => {
    if (!detail || busy) return;
    setBusy(`asset:${assetId}`);
    setError("");
    try {
      await assetClient.deleteBrandKitAsset(detail.id, assetId);
      setDetail((current) => {
        const next = removeAssetFromKit(current, assetId);
        onActiveKitChange?.(next);
        return next;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "品牌资产删除失败。");
    } finally {
      setBusy("");
    }
  }, [assetClient, busy, detail, onActiveKitChange]);

  const addColor = useCallback(() => createAsset({ asset_type: "color", display_name: "主色", role: "primary", text_content: "#222222" }), [createAsset]);
  const addFont = useCallback(() => {
    const family = window.prompt("字体名称，例如 Noto Sans SC")?.trim();
    if (!family) return;
    void createAsset({ asset_type: "font", display_name: family, role: "primary", text_content: family, metadata: { category: "sans-serif", variant: "regular" } });
  }, [createAsset]);

  const uploadFileAsset = useCallback(async (file) => {
    if (!detail || !file || busy || !["logo", "image"].includes(activeTab)) return;
    setBusy("upload");
    setError("");
    try {
      const uploaded = await assetClient.uploadFile(file, {
        purpose: `new-canvas/brand-${activeTab}`,
      });
      const storageObjectId = text(uploaded?.upload?.storageObjectId ?? uploaded?.storageObject?.id);
      if (!storageObjectId) throw new Error("上传完成但未返回稳定存储对象。");
      const asset = assetFromMutation(await assetClient.createBrandKitAsset(detail.id, {
        asset_type: activeTab,
        display_name: file.name.replace(/\.[^.]+$/, "") || (activeTab === "logo" ? "Logo" : "品牌图片"),
        storage_object_id: storageObjectId,
        metadata: { contentType: file.type, originalFileName: file.name },
      }));
      setDetail((current) => {
        const next = patchAssetInKit(current, asset);
        onActiveKitChange?.(next);
        return next;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "品牌文件上传失败。");
    } finally {
      setBusy("");
    }
  }, [activeTab, assetClient, busy, detail, onActiveKitChange]);

  const uploadFontAsset = useCallback(async (file) => {
    if (!detail || !file || busy) return;
    setBusy("font-upload");
    setError("");
    try {
      const uploaded = await assetClient.uploadFile(file, {
        purpose: "new-canvas/brand-font",
        uploadLimits: BRAND_FONT_UPLOAD_LIMITS,
      });
      const storageObjectId = text(uploaded?.upload?.storageObjectId ?? uploaded?.storageObject?.id);
      if (!storageObjectId) throw new Error("字体上传完成但未返回稳定存储对象。");
      const family = file.name.replace(/\.[^.]+$/, "").trim() || "品牌字体";
      const asset = assetFromMutation(await assetClient.createBrandKitAsset(detail.id, {
        asset_type: "font",
        display_name: family,
        role: "primary",
        text_content: family,
        storage_object_id: storageObjectId,
        metadata: { category: "sans-serif", variant: "regular", contentType: file.type, originalFileName: file.name },
      }));
      setDetail((current) => {
        const next = patchAssetInKit(current, asset);
        onActiveKitChange?.(next);
        return next;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "品牌字体上传失败。");
    } finally {
      setBusy("");
    }
  }, [assetClient, busy, detail, onActiveKitChange]);

  const visibleAssets = useMemo(() => brandKitAssetsByType(detail, activeTab), [activeTab, detail]);

  const insertFileAsset = useCallback(async (asset) => {
    const fileUrl = assetFileUrl(asset);
    if (!fileUrl || !assetStorageObjectId(asset)) {
      setError("该品牌文件的签名地址或稳定存储对象不可用，请刷新后重试。");
      return;
    }
    setBusy(`insert:${asset.id}`);
    try {
      await insertCloudAssetOnCanvas(api, {
        id: asset.id,
        cloud: true,
        type: "image",
        title: assetName(asset),
        mimeType: text(asset?.metadata?.contentType) || "image/png",
        storageUrl: fileUrl,
        storageObjectId: assetStorageObjectId(asset),
        source: "brand-kit",
        sourceLabel: detail?.name ?? "品牌套件",
        sourceAction: "brand-kit",
        resourceType: activeTab,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "品牌素材插入失败。");
    } finally {
      setBusy("");
    }
  }, [activeTab, api, detail?.name]);

  if (!open) return null;
  return (
    <section className="lm-brand-panel" role="dialog" aria-label="品牌套件" onPointerDown={(event) => event.stopPropagation()}>
      <header className="lm-brand-panel-header">
        <div><strong>品牌套件</strong><span>项目级设计规范</span></div>
        <button type="button" className="lm-brand-icon-button" aria-label="关闭品牌套件" onClick={onClose}><X aria-hidden="true" /></button>
      </header>

      {!projectId ? <p className="lm-brand-empty">品牌套件仅适用于业务项目画布。</p> : status === "loading" ? <p className="lm-brand-status"><LoaderCircle className="is-spinning" />正在加载品牌套件…</p> : status === "error" ? <div className="lm-brand-error"><span>{error}</span><button type="button" onClick={reload}><RefreshCw />重试</button></div> : (
        <>
          <div className="lm-brand-kit-toolbar">
            <select aria-label="选择项目品牌套件" value={selectedKitId} disabled={Boolean(busy)} onChange={(event) => void chooseKit(event.target.value)}>
              <option value="">不使用品牌套件</option>
              {kits.map((kit) => <option key={kit.id} value={kit.id}>{kit.name}{kit.is_default ? " · 默认" : ""}</option>)}
            </select>
            <button type="button" className="lm-brand-icon-button" title="新建品牌套件" aria-label="新建品牌套件" disabled={Boolean(busy)} onClick={() => void createKit()}><Plus /></button>
            <button type="button" className="lm-brand-icon-button" title="复制当前品牌套件" aria-label="复制当前品牌套件" disabled={!detail || Boolean(busy)} onClick={() => void duplicateKit()}><Copy /></button>
            <button type="button" className="lm-brand-icon-button is-danger" title="删除当前品牌套件" aria-label="删除当前品牌套件" disabled={!detail || Boolean(busy)} onClick={() => void deleteKit()}><Trash2 /></button>
          </div>

          {error ? <div className="lm-brand-error"><span>{error}</span></div> : null}
          {!detail ? <p className="lm-brand-empty">选择或新建品牌套件后即可配置颜色、字体、Logo 和参考图片。</p> : (
            <>
              <div className="lm-brand-kit-fields">
                <label><span>名称</span><input value={nameDraft} maxLength={100} onChange={(event) => setNameDraft(event.target.value)} /></label>
                <label className="lm-brand-default"><input type="checkbox" checked={detail.is_default} disabled={Boolean(busy)} onChange={(event) => void saveKit({ is_default: event.target.checked })} /><span>设为默认套件</span></label>
                <label className="is-wide"><span>品牌指南</span><textarea value={guidanceDraft} maxLength={5000} rows={3} placeholder="描述品牌语气、构图、禁用元素和使用边界" onChange={(event) => setGuidanceDraft(event.target.value)} /></label>
                <button type="button" className="lm-brand-primary-action" disabled={Boolean(busy)} onClick={() => void saveKit()}>{busy === "save" ? <LoaderCircle className="is-spinning" /> : <Check />}保存规范</button>
              </div>

              <div className="lm-brand-asset-tabs" role="tablist" aria-label="品牌资产类型">
                {ASSET_TABS.map(([value, label, Icon]) => <button key={value} type="button" role="tab" aria-selected={activeTab === value} className={activeTab === value ? "is-active" : ""} onClick={() => setActiveTab(value)}><Icon />{label}<span>{brandKitAssetsByType(detail, value).length}</span></button>)}
              </div>

              <div className="lm-brand-assets">
                {activeTab === "color" ? (
                  <>
                    {visibleAssets.map((asset) => <div className="lm-brand-color-row" key={asset.id}>
                      <input type="color" aria-label={`修改颜色 ${assetName(asset)}`} value={text(asset.text_content ?? asset.textContent) || "#222222"} disabled={Boolean(busy)} onChange={(event) => void updateAsset(asset.id, { text_content: event.target.value })} />
                      <AssetTextInput value={assetName(asset)} ariaLabel={`重命名颜色 ${assetName(asset)}`} onCommit={(value) => updateAsset(asset.id, { display_name: value })} />
                      <select aria-label={`颜色角色 ${assetName(asset)}`} value={text(asset.role)} disabled={Boolean(busy)} onChange={(event) => void updateAsset(asset.id, { role: event.target.value || null })}><option value="">未指定</option>{COLOR_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</select>
                      <button type="button" className="lm-brand-icon-button is-danger" aria-label={`删除颜色 ${assetName(asset)}`} disabled={Boolean(busy)} onClick={() => void deleteAsset(asset.id)}><Trash2 /></button>
                    </div>)}
                    <button type="button" className="lm-brand-add-action" disabled={Boolean(busy)} onClick={() => void addColor()}><Plus />添加颜色</button>
                  </>
                ) : activeTab === "font" ? (
                  <>
                    {visibleAssets.map((asset) => <div className="lm-brand-font-row" key={asset.id}>
                      <span className="lm-brand-font-preview" style={{ fontFamily: `"${text(asset.text_content ?? asset.textContent)}", sans-serif` }}>Ag</span>
                      <div><AssetTextInput value={assetName(asset)} ariaLabel={`重命名字体 ${assetName(asset)}`} onCommit={(value) => updateAsset(asset.id, { display_name: value })} /><small>{text(asset.text_content ?? asset.textContent)}</small></div>
                      <select aria-label={`字体角色 ${assetName(asset)}`} value={text(asset.role)} disabled={Boolean(busy)} onChange={(event) => void updateAsset(asset.id, { role: event.target.value || null })}><option value="">未指定</option>{FONT_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</select>
                      <button type="button" className="lm-brand-icon-button is-danger" aria-label={`删除字体 ${assetName(asset)}`} disabled={Boolean(busy)} onClick={() => void deleteAsset(asset.id)}><Trash2 /></button>
                    </div>)}
                    <div className="lm-brand-add-actions"><button type="button" className="lm-brand-add-action" disabled={Boolean(busy)} onClick={addFont}><Plus />添加字体名称</button><button type="button" className="lm-brand-add-action" disabled={Boolean(busy)} onClick={() => fontUploadInputRef.current?.click()}>{busy === "font-upload" ? <LoaderCircle className="is-spinning" /> : <Type />}上传字体文件</button></div>
                    <input ref={fontUploadInputRef} type="file" accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadFontAsset(file); }} />
                  </>
                ) : (
                  <>
                    <div className="lm-brand-file-grid">
                      {visibleAssets.map((asset) => <article className="lm-brand-file-row" key={asset.id}>
                        <button type="button" className="lm-brand-file-preview" aria-label={`插入 ${assetName(asset)}`} disabled={Boolean(busy) || !assetFileUrl(asset)} onClick={() => void insertFileAsset(asset)}>{assetFileUrl(asset) ? <img src={assetFileUrl(asset)} alt="" loading="lazy" /> : <ImagePlus />}</button>
                        <AssetTextInput value={assetName(asset)} ariaLabel={`重命名品牌文件 ${assetName(asset)}`} onCommit={(value) => updateAsset(asset.id, { display_name: value })} />
                        <div><button type="button" className="lm-brand-icon-button" title="插入画布" aria-label={`插入品牌文件 ${assetName(asset)}`} disabled={Boolean(busy) || !assetFileUrl(asset)} onClick={() => void insertFileAsset(asset)}><Plus /></button><button type="button" className="lm-brand-icon-button is-danger" aria-label={`删除品牌文件 ${assetName(asset)}`} disabled={Boolean(busy)} onClick={() => void deleteAsset(asset.id)}><Trash2 /></button></div>
                      </article>)}
                    </div>
                    <button type="button" className="lm-brand-add-action" disabled={Boolean(busy)} onClick={() => uploadInputRef.current?.click()}>{busy === "upload" ? <LoaderCircle className="is-spinning" /> : <ImagePlus />}上传{activeTab === "logo" ? " Logo" : "品牌图片"}</button>
                    <input ref={uploadInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/avif" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadFileAsset(file); }} />
                  </>
                )}
              </div>

              <footer className="lm-brand-apply-actions">
                <button type="button" disabled={!api || Boolean(busy)} onClick={() => { if (!applyBrandKitToCanvasSelection(api, detail)) setError("请先选择可应用品牌样式的文本或图形。"); }}>应用到选中元素</button>
                <button type="button" disabled={!api || Boolean(busy)} onClick={() => { if (!applyBrandKitBackground(api, detail)) setError("请先添加 role 为 background 的品牌色。"); }}>应用画布背景</button>
              </footer>
            </>
          )}
        </>
      )}
    </section>
  );
}
