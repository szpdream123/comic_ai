const DEFAULT_ASSISTANT_URL = "http://127.0.0.1:48123";

function resolveAssistantUrl(path = "") {
  const configured = typeof globalThis.__COMIC_AI_LOCAL_COMPUTE_ASSISTANT_URL__ === "string"
    ? globalThis.__COMIC_AI_LOCAL_COMPUTE_ASSISTANT_URL__.trim()
    : "";
  const baseUrl = (configured || DEFAULT_ASSISTANT_URL).replace(/\/$/, "");
  return `${baseUrl}/${String(path).replace(/^\//, "")}`;
}

export function getLocalComputeAssistantInstallerUrl() {
  return typeof globalThis.__COMIC_AI_LOCAL_COMPUTE_ASSISTANT_INSTALLER_URL__ === "string"
    ? globalThis.__COMIC_AI_LOCAL_COMPUTE_ASSISTANT_INSTALLER_URL__.trim()
    : "";
}

function resolveInstaller() {
  const configured = globalThis.__COMIC_AI_LOCAL_COMPUTE_ASSISTANT_INSTALLERS__;
  const platform = detectPlatform();
  if (configured && typeof configured === "object") {
    const candidate = configured[platform];
    if (candidate && typeof candidate === "object") return { platform, ...candidate };
  }
  const downloadUrl = getLocalComputeAssistantInstallerUrl();
  return downloadUrl ? { platform, downloadUrl } : { platform };
}

function detectPlatform() {
  const platform = String(globalThis.navigator?.userAgentData?.platform ?? globalThis.navigator?.platform ?? "").toLowerCase();
  const userAgent = String(globalThis.navigator?.userAgent ?? "").toLowerCase();
  if (platform.includes("win") || userAgent.includes("windows")) return "windows";
  if (platform.includes("mac") || userAgent.includes("mac os")) return "macos";
  if (platform.includes("linux") || userAgent.includes("linux")) return "linux";
  return "unknown";
}

export async function installLocalComputeAssistant({ onProgress } = {}) {
  const installer = resolveInstaller();
  if (installer.platform === "windows" && installer.appInstallerUrl) {
    onProgress?.({ progress: 5, message: "正在唤起 Windows 安装器" });
    globalThis.location.assign(`ms-appinstaller:?source=${encodeURIComponent(installer.appInstallerUrl)}`);
    onProgress?.({ progress: 15, message: "Windows 安装器正在下载并安装" });
    return { mode: "system-installer", platform: installer.platform };
  }
  if (!installer.downloadUrl) {
    throw new Error(installer.platform === "unknown"
      ? "无法识别当前系统，请在 Windows、macOS 或 Linux 设备上安装本地计算助手。"
      : `当前 ${installer.platform} 安装包尚未发布。`);
  }
  const response = await fetch(installer.downloadUrl);
  if (!response.ok || !response.body) throw new Error("计算助手安装包下载失败。");
  const total = Number(response.headers.get("content-length") ?? 0);
  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  onProgress?.({ progress: 0, message: "正在下载安装包" });
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.byteLength;
      onProgress?.({
        progress: total ? Math.min(99, Math.round((loaded / total) * 100)) : 0,
        message: total ? `正在下载安装包 ${Math.round((loaded / total) * 100)}%` : "正在下载安装包",
      });
    }
  }
  const fileName = String(installer.fileName ?? resolveInstallerFileName(installer.downloadUrl));
  const objectUrl = globalThis.URL.createObjectURL(new Blob(chunks, { type: "application/octet-stream" }));
  const link = globalThis.document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  link.style.display = "none";
  globalThis.document.body.append(link);
  link.click();
  link.remove();
  globalThis.setTimeout(() => globalThis.URL.revokeObjectURL(objectUrl), 60_000);
  onProgress?.({ progress: 100, message: "安装包已下载，正在等待系统启动安装" });
  return { mode: "download", platform: installer.platform, fileName };
}

function resolveInstallerFileName(url) {
  try {
    const pathname = new URL(url, globalThis.location?.origin).pathname;
    return pathname.split("/").pop() || "comic-ai-local-compute-assistant-installer";
  } catch {
    return "comic-ai-local-compute-assistant-installer";
  }
}

async function requestAssistant(path, options = {}) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), Number(options.timeoutMs ?? 10_000));
  const { timeoutMs: _timeoutMs, ...requestOptions } = options;
  try {
    const response = await fetch(resolveAssistantUrl(path), { ...requestOptions, signal: controller.signal });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(String(payload?.error ?? `助手请求失败 (${response.status})`));
    }
    return response;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export async function checkLocalComputeAssistant() {
  const response = await requestAssistant("health", { timeoutMs: 1500 });
  const payload = await response.json();
  return {
    ready: payload?.ok === true,
    version: String(payload?.version ?? ""),
    device: String(payload?.device ?? "本机 GPU"),
  };
}

export async function runLocalComputeAssistant(file, { onProgress } = {}) {
  const formData = new FormData();
  formData.set("file", file);
  const submission = await requestAssistant("jobs", {
    method: "POST",
    body: formData,
    timeoutMs: 120_000,
  });
  const created = await submission.json();
  const jobId = String(created?.id ?? created?.jobId ?? "").trim();
  if (!jobId) throw new Error("本地计算助手未返回任务编号。");
  return pollJob(jobId, onProgress);
}

async function pollJob(jobId, onProgress) {
  const response = await requestAssistant(`jobs/${encodeURIComponent(jobId)}`, { timeoutMs: 10_000 });
  const job = await response.json();
  const status = String(job?.status ?? "running").toLowerCase();
  const progress = Number(job?.progress ?? job?.percent ?? 0);
  onProgress?.({
    progress: Number.isFinite(progress) ? progress : 0,
    message: String(job?.message ?? (status === "queued" ? "等待本机计算资源" : "本机 GPU 正在处理")),
  });
  if (["succeeded", "completed", "complete", "done", "success"].includes(status)) {
    const output = await requestAssistant(`jobs/${encodeURIComponent(jobId)}/output`, { timeoutMs: 120_000 });
    return {
      file: await output.blob(),
      fileName: String(job?.fileName ?? "depth.mp4"),
    };
  }
  if (["failed", "error", "cancelled"].includes(status)) {
    throw new Error(String(job?.error ?? job?.message ?? "本地计算助手处理失败。"));
  }
  await new Promise((resolve) => globalThis.setTimeout(resolve, 700));
  return pollJob(jobId, onProgress);
}
