const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

export function renderFreeConversationApprovalDetails(approval, agent) {
  const input = approval.input;
  if (!input || typeof input !== "object") return "";
  const request = input.request ?? {};
  const quote = approval.quote ?? {};
  const priced = quote.status === "available" && typeof quote.estimatedCredits === "number" && Number.isFinite(quote.estimatedCredits) && quote.estimatedCredits >= 0;
  const params = priced ? quote.parameters ?? request.parameters ?? {} : request.parameters ?? {};
  const kind = { video: "视频", image: "图片", audio: "音频" }[input.kind] || "媒体";
  const model = (agent.generationModels ?? []).find(model => model.modelCode === (quote.model || request.model));
  const labels = [["durationSec", "时长", "秒"], ["durationSeconds", "时长", "秒"], ["duration", "时长", "秒"], ["ratio", "画幅", ""], ["aspectRatio", "画幅", ""], ["aspect_ratio", "画幅", ""], ["resolution", "清晰度", ""], ["size", "尺寸", ""]];
  const seen = new Set();
  const parameters = labels.flatMap(([key, label, suffix]) => {
    if (params[key] === undefined || seen.has(label) || !["string", "number"].includes(typeof params[key])) return [];
    seen.add(label);
    return [`<span>${label} ${escape(params[key])}${suffix}</span>`];
  });
  const refs = (Array.isArray(input.fileGrantIds) ? input.fileGrantIds : []).map((id, index) => {
    const grant = (agent.fileGrants ?? []).find(grant => grant.id === id);
    const attachment = (agent.messages ?? []).flatMap(message => message.attachments ?? []).find(item => item.fileGrantId === id || (grant?.storageObjectId && item.storageObjectId === grant.storageObjectId));
    const media = (agent.messages ?? []).map(message => message.media).find(item => item && grant?.storageObjectId && item.storageObjectId === grant.storageObjectId);
    const thumbnail = grant?.storageObjectId && (attachment?.kind === "image" || media?.kind === "image")
      ? `<img src="/api/storage/objects/${encodeURIComponent(grant.storageObjectId)}/content?thumbnail=1" alt="" loading="lazy" />` : "";
    return `<span>${thumbnail}${escape(attachment?.name || `参考素材 ${index + 1}`)}</span>`;
  }).join("");
  const prompt = String(request.prompt ?? request.text ?? request.motionPrompt ?? "");
  return `<div class="canvas-agent-generation-review">
    <header><strong>将生成 1 个${kind}</strong><span>${priced ? `${quote.estimatedCredits.toLocaleString("zh-CN")} 积分` : "报价暂不可用"}</span></header>
    ${refs ? `<div class="canvas-agent-approval-references" aria-label="本次参考素材">${refs}</div>` : ""}
    <div class="canvas-agent-approval-parameters">${model?.modelLabel ? `<span>${escape(model.modelLabel)}</span>` : ""}${parameters.join("")}</div>
    ${prompt ? `<details><summary>${escape(prompt.slice(0, 96))}${prompt.length > 96 ? "…" : ""}<small>查看完整提示词</small></summary><p>${escape(prompt)}</p>${request.negativePrompt ? `<p>避免：${escape(request.negativePrompt)}</p>` : ""}</details>` : ""}
    <small>${priced ? "按以上内容提交；实际扣费遵循生成结果与退款规则。" : "当前无法取得预计积分，请稍后重试。"}</small>
  </div>`;
}
