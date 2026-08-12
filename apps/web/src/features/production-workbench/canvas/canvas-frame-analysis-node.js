export function isCanvasFrameAnalysisNode(node = {}) {
  return node?.type === "ai-storyboard" && node?.data?.canvasMode === "frame-analysis";
}

export function renderCanvasFrameAnalysisNodeBody(node = {}) {
  const data = node?.data ?? {};
  const nodeId = String(node?.id ?? "");
  const status = String(data.status ?? "empty").trim().toLowerCase();
  const running = ["queued", "running", "processing"].includes(status);
  const failed = ["failed", "canceled", "manual_review_required", "result_unknown"].includes(status);
  const segments = Array.isArray(data.analysisSegments)
    ? data.analysisSegments
    : Array.isArray(data.analysisResult?.segments) ? data.analysisResult.segments : [];
  const progress = Math.max(0, Math.min(100, Math.round(Number(data.analysisProgress ?? data.generationProgress ?? 0) || 0)));
  const durationMs = Math.max(0, Number(data.analysisDurationMs ?? 0) || 0);
  const segmentDurationSeconds = Math.max(1, Math.min(300, Math.round(Number(data.segmentDurationSeconds ?? 15) || 15)));
  const preview = segments.slice(0, 3).map((segment, index) => `
    <li>
      <time>${escapeHtml(formatRange(segment?.startMs, segment?.endMs))}</time>
      <span>${escapeHtml(firstText(segment?.description, segment?.positivePrompt, `分镜 ${index + 1}`))}</span>
    </li>
  `).join("");
  return `<section class="canvas-frame-analysis-body" data-canvas-frame-analysis-body data-node-id="${escapeAttr(nodeId)}">
    ${running ? `<div class="canvas-frame-analysis-progress" role="status" aria-label="逐帧拉片进度 ${progress}%"><span style="--analysis-progress:${progress}%"></span><strong>${escapeHtml(data.analysisStageLabel ?? "正在解析视频时间线")}</strong><small>${progress}%</small></div>` : ""}
    ${failed ? `<div class="canvas-frame-analysis-error" role="alert"><strong>拉片失败</strong><small>${escapeHtml(data.failureMessage ?? "请检查视频素材或解析组件后重试")}</small></div>` : ""}
    ${segments.length ? `<div class="canvas-frame-analysis-summary"><header><strong>${segments.length} 个分镜</strong><small>${durationMs ? formatDuration(durationMs) : "时间线分析完成"}</small></header><ol>${preview}</ol>${segments.length > 3 ? `<small>另有 ${segments.length - 3} 个分镜</small>` : ""}</div>` : !running && !failed ? `<div class="canvas-frame-analysis-empty"><strong>连接视频后开始拉片</strong><small>提取关键帧、人物、道具、场景和镜头衔接</small></div>` : ""}
    <footer>
      <label><span>分段</span><input type="number" min="1" max="300" step="1" value="${segmentDurationSeconds}" data-canvas-frame-analysis-segment data-node-id="${escapeAttr(nodeId)}" aria-label="逐帧拉片分段秒数" ${running ? "disabled" : ""} /><small>秒</small></label>
      ${segments.length ? `<button type="button" data-action="expand-canvas-frame-analysis" data-node-id="${escapeAttr(nodeId)}" ${running ? "disabled" : ""}>展开节点</button>` : ""}
      ${running
        ? `<button type="button" data-action="cancel-canvas-frame-analysis" data-node-id="${escapeAttr(nodeId)}">取消</button>`
        : `<button type="button" class="primary" data-action="run-canvas-node" data-node-id="${escapeAttr(nodeId)}">${segments.length ? "重新拉片" : "开始拉片"}</button>`}
    </footer>
  </section>`;
}

function formatRange(startMs, endMs) {
  return `${formatDuration(startMs)}-${formatDuration(endMs)}`;
}

function formatDuration(value) {
  const seconds = Math.max(0, Math.round(Number(value ?? 0) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/["']/g, (character) => character === '"' ? "&quot;" : "&#39;");
}
