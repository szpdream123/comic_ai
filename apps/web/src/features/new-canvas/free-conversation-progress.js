const success = new Set(["succeeded", "completed", "success"]);
const failed = new Set(["failed", "canceled", "cancelled"]);
const savingStages = new Set(["provider_succeeded", "artifact_fetching", "artifact_fetched", "artifact_persisting", "asset_persisting", "asset_transfer_retry_pending", "asset_persist_failed"]);

function timestamp(value) {
  return typeof value === "string" && value.trim() ? Date.parse(value) : NaN;
}

function duration(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  return total < 60 ? `${total} 秒` : `${Math.floor(total / 60)} 分 ${total % 60} 秒`;
}

// Only successful, distinct tasks visible in this conversation are estimation samples.
export function describeGenerationProgress(media = {}, history = [], now = Date.now()) {
  const label = media.kind === "video" ? "视频" : media.kind === "audio" ? "音频" : "图片";
  const submitted = timestamp(media.submittedAt);
  const end = timestamp(media.returnedAt);
  const terminal = success.has(media.status) || failed.has(media.status);
  const seconds = ((terminal && Number.isFinite(end) ? end : now) - submitted) / 1000;
  const elapsed = Number.isFinite(seconds) && seconds >= 0 ? `已用时 ${duration(seconds)}` : "用时同步中";
  const unknown = ["result_unknown", "manual_review_required"].includes(media.status);
  const isFailed = failed.has(media.status);
  const saving = !isFailed && !unknown && (savingStages.has(media.progressStage) || (success.has(media.status) && !media.url));
  const queued = ["queued", "pending", "created"].includes(media.status) || ["task_created", "provider_submitting"].includes(media.progressStage);
  const stage = isFailed ? "failed" : unknown ? "unknown" : saving ? "saving" : success.has(media.status) ? "completed" : queued ? "queued" : "rendering";
  const title = isFailed ? (["canceled", "cancelled"].includes(media.status) ? `${label}生成已取消` : `${label}生成失败`)
    : unknown ? "正在核实生成结果" : saving ? "正在保存结果" : stage === "completed" ? `${label}已完成`
    : queued ? `${label}排队中` : `${label}生成中`;
  const seen = new Set();
  const samples = history.filter(task => {
    if (!task?.taskId || seen.has(task.taskId) || task.taskId === media.taskId) return false;
    seen.add(task.taskId);
    return media.model && task.model === media.model && task.kind === media.kind && success.has(task.status);
  }).sort((a, b) => timestamp(b.returnedAt) - timestamp(a.returnedAt)).slice(0, 20)
    .map(task => (timestamp(task.returnedAt) - timestamp(task.submittedAt)) / 1000)
    .filter(value => Number.isFinite(value) && value > 0 && value <= 86400).sort((a, b) => a - b);
  let estimate = "暂无可靠预估，完成后会自动显示";
  let sampleCount = 0;
  if (samples.length >= 3 && !terminal && !unknown && !saving) {
    sampleCount = samples.length;
    const low = samples[Math.floor((samples.length - 1) * 0.5)];
    const high = samples[Math.ceil((samples.length - 1) * 0.8)];
    const source = `本会话同模型 ${sampleCount} 次完成记录，仅供参考`;
    estimate = Number.isFinite(seconds) && seconds > high
      ? `已超过近期参考时长，任务仍在处理中；${source}`
      : `预计总耗时约 ${Math.max(1, Math.floor(low / 60))}–${Math.max(1, Math.ceil(high / 60))} 分钟（含排队）；${source}`;
  }
  if (saving) estimate = "生成结果正在传回并保存，请勿重复提交";
  if (unknown) estimate = "正在核实结果与积分状态，请先查看任务中心，避免重复提交";
  if (isFailed) estimate = media.error || "请查看任务中心的失败原因与积分处理状态后，再决定是否重新生成";
  return { title, stage, elapsed, estimate, sampleCount, active: !terminal && !unknown || saving };
}
