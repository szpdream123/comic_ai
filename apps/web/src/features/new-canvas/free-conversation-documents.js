import { renderCanvasMarkdownPreview } from "../production-workbench/project-detail.js";
import { renderFreeConversationStoryboard } from "./free-conversation-storyboard.js";

const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

export function creativeDocumentNextStep(doc) {
  const title = String(doc.title ?? "");
  const source = `《${title}》第 ${Number(doc.version) || 1} 版`;
  if (/提示词|prompt/i.test(title)) return { label: "准备视频生成方案", prompt: `根据${source}准备视频生成方案，沿用已确认的参考素材和参数，提交前展示将生成的片段及预计积分。` };
  if (/分镜|故事板/.test(title)) return { label: "整理分镜提示词", prompt: `根据${source}，使用当前选定的分镜技能整理逐片段的视频提示词 Markdown 文档，保留镜号、参考素材和衔接关系，先不生成视频。` };
  if (/素材清单/.test(title)) return { label: "准备参考素材", prompt: `根据${source}准备角色和场景参考素材，先复用已有素材，缺失部分在生成前展示方案及预计积分。` };
  return null;
}

export function findCreativeDocument(messages, documentId, version) {
  return [...(messages ?? [])].reverse().map(message => message.creative)
    .find(doc => doc?.type === "document" && doc.documentId === documentId
      && (version === undefined || Number(doc.version) === Number(version))) ?? null;
}

export function renderCreativeDocumentCard(doc, busy) {
  const title = String(doc.title || "创作文档").replace(/\.md$/i, "");
  const next = creativeDocumentNextStep(doc);
  return `<section class="canvas-agent-creative-card document is-document-link" aria-label="创作文档">
    <button type="button" class="canvas-agent-document-open" data-agent-action="open-creative-document" data-document-id="${escape(doc.documentId)}" data-document-version="${escape(doc.version)}">
      <span class="canvas-agent-document-icon" aria-hidden="true">MD</span>
      <span class="canvas-agent-document-label"><strong>${escape(title)}.md</strong><small>版本 ${escape(doc.version)} · ${String(doc.content ?? "").length.toLocaleString("zh-CN")} 字 · 查看全文</small></span>
      <span aria-hidden="true">↗</span>
    </button>
    <footer><button type="button" data-agent-action="continue-creative-document" data-document-id="${escape(doc.documentId)}" data-document-title="${escape(doc.title)}" data-document-version="${escape(doc.version)}" ${busy ? "disabled" : ""}>继续编辑</button>${next ? `<button type="button" data-agent-action="next-creative-document" data-document-id="${escape(doc.documentId)}" data-document-version="${escape(doc.version)}" ${busy ? "disabled" : ""}>${next.label} ↗</button>` : ""}</footer>
  </section>`;
}

export function renderCreativeDocumentBody(doc) {
  return renderFreeConversationStoryboard(`<section class="canvas-agent-creative-card document"><div class="canvas-agent-creative-document-markdown">${renderCanvasMarkdownPreview(doc.content)}</div></section>`, true);
}

export function creativeDocumentFilename(doc) {
  return `${String(doc.title || "创作文档").replace(/\.md$/i, "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 100)}-v${Number(doc.version) || 1}.md`;
}

// The native dialog provides focus containment and Escape handling, and survives timeline polling.
export function openCreativeDocument(doc, { host, onEdit, canEdit = true } = {}) {
  const owner = host?.ownerDocument ?? globalThis.document;
  if (!owner?.createElement) return () => {};
  const previousFocus = owner.activeElement;
  const dialog = owner.createElement("dialog");
  dialog.className = "canvas-agent-document-dialog";
  dialog.setAttribute("aria-label", String(doc.title || "创作文档"));
  const style = host && globalThis.getComputedStyle?.(host);
  for (const name of ["background", "surface", "foreground", "muted", "accent-color", "control", "control-active", "control-border"]) {
    const key = `--new-canvas-${name}`;
    const value = style?.getPropertyValue(key);
    if (value) dialog.style.setProperty(key, value);
  }
  dialog.innerHTML = `<header><div><small>创作文档 · 版本 ${escape(doc.version)}</small><h2>${escape(doc.title)}</h2></div><button type="button" data-document-command="close" aria-label="关闭文档" autofocus>×</button></header>
    <div class="canvas-agent-document-toolbar"><button type="button" data-document-command="copy">复制全文</button><button type="button" data-document-command="download">下载 Markdown</button><button type="button" data-document-command="edit" ${canEdit ? "" : "disabled"}>继续编辑</button><span role="status" aria-live="polite"></span></div>
    <div class="canvas-agent-document-reader canvas-agent-panel is-media-only">${renderCreativeDocumentBody(doc)}</div>`;
  const cleanup = () => { dialog.remove(); if (previousFocus?.isConnected) previousFocus.focus(); };
  dialog.addEventListener("close", cleanup, { once: true });
  dialog.addEventListener("click", async event => {
    const command = event.target.closest?.("[data-document-command]")?.dataset.documentCommand;
    const status = dialog.querySelector('[role="status"]');
    if (command === "close") dialog.close();
    if (command === "edit" && canEdit) { dialog.close(); onEdit?.(); }
    if (command === "copy") {
      try { await globalThis.navigator.clipboard.writeText(String(doc.content ?? "")); status.textContent = "已复制"; }
      catch { status.textContent = "无法复制，请下载文档后查看。"; }
    }
    if (command === "download") {
      const url = URL.createObjectURL(new Blob([String(doc.content ?? "")], { type: "text/markdown;charset=utf-8" }));
      const link = owner.createElement("a");
      link.href = url;
      link.download = creativeDocumentFilename(doc);
      dialog.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = "已下载";
    }
  });
  owner.body.append(dialog);
  dialog.showModal();
  return () => { dialog.close(); cleanup(); };
}

export function renderCreativeStage(messages = []) {
  const plan = [...messages].reverse().find(message => message.creative?.type === "plan")?.creative;
  if (!Array.isArray(plan?.steps) || !plan.steps.length) return "";
  const completed = plan.steps.filter(step => step.status === "completed").length;
  const current = plan.steps.find(step => step.status === "running") ?? plan.steps.find(step => step.status !== "completed");
  return `<div class="canvas-agent-creative-stage" role="status"><span>${completed}/${plan.steps.length}</span><strong>${escape(current?.title || "创作计划已完成")}</strong><small>${current?.status === "running" ? "进行中" : current ? "待继续" : "已完成"}</small></div>`;
}
