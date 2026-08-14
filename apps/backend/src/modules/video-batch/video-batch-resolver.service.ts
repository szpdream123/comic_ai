import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MAX_BATCH_LINKS = 20;
const MAX_PROCESS_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_CONCURRENT_RESOLUTIONS = 4;
const RESOLUTION_TIMEOUT_MS = 25_000;
const SUPPORTED_DOMAINS = [
  "b23.tv",
  "bili2233.cn",
  "bilibili.com",
  "chenzhongtech.com",
  "douyin.com",
  "iesdouyin.com",
  "kuaishou.com",
  "ksurl.cn",
  "xiaohongshu.com",
  "xhslink.com",
] as const;
const URL_PATTERN = /https?:\/\/[^\s<>"'，。！？；]+/giu;

export type VideoBatchTask = {
  sourceUrl: string;
  status: "ready" | "failed";
  title: string;
  error: string;
  streamUrl: string;
  audioStreamUrl?: string;
};

type YtDlpRunner = (url: string, cookie?: string) => Promise<Record<string, unknown>>;

let activeResolutionCount = 0;
const resolutionWaiters: Array<() => void> = [];

function resolveYtDlpCommand() {
  const configured = String(process.env.VIDEO_BATCH_YT_DLP_PATH ?? "").trim();
  if (configured) return { file: configured, prefix: [] };
  const bundled = join(process.cwd(), "apps", "backend", "vendor", "yt-dlp.exe");
  if (process.platform === "win32" && existsSync(bundled)) return { file: bundled, prefix: [] };
  throw new Error("video_batch_binary_missing");
}

function isSupportedUrl(url: URL) {
  return ["http:", "https:"].includes(url.protocol) && SUPPORTED_DOMAINS.some((domain) => (
    url.hostname === domain || url.hostname.endsWith(`.${domain}`)
  ));
}

function isDouyinUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "douyin.com" || parsed.hostname.endsWith(".douyin.com")
      || parsed.hostname === "iesdouyin.com" || parsed.hostname.endsWith(".iesdouyin.com");
  } catch {
    return false;
  }
}

export function resolveVideoBatchCookiesPath(url: string) {
  if (isDouyinUrl(url)) {
    return String(
      process.env.VIDEO_BATCH_DOUYIN_COOKIES_FILE
      ?? process.env.VIDEO_BATCH_YT_DLP_COOKIES_FILE
      ?? "",
    ).trim();
  }
  return String(process.env.VIDEO_BATCH_YT_DLP_COOKIES_FILE ?? "").trim();
}

export function extractVideoBatchUrls(value: unknown) {
  const matches = String(value ?? "").match(URL_PATTERN) ?? [];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const match of matches) {
    const sourceUrl = match.replace(/[),.;!?]+$/u, "");
    try {
      const parsed = new URL(sourceUrl);
      if (!isSupportedUrl(parsed) || seen.has(parsed.href)) continue;
      seen.add(parsed.href);
      urls.push(parsed.href);
    } catch {
      // Ignore non-URL fragments from user-shared copy.
    }
  }
  if (urls.length > MAX_BATCH_LINKS) throw new Error("video_batch_link_limit");
  return urls;
}

function resolveTaskError(error: unknown, sourceUrl: string) {
  const message = String(error instanceof Error ? error.message : error).toLowerCase();
  if (message.includes("video_batch_binary_missing") || message.includes("no module named yt_dlp")) {
    return "视频解析服务暂未部署，请联系管理员。";
  }
  if (message.includes("video_batch_resolve_timeout")) {
    return "平台响应超时，请稍后重试。";
  }
  if (message.includes("fresh cookies") || message.includes("cookies")) {
    return isDouyinUrl(sourceUrl)
      ? "抖音解析需要管理员配置有效的服务端 Cookie。"
      : "该平台当前需要服务端访问会话，暂时无法获取播放地址。";
  }
  if (["private", "login", "premium", "drm", "sign in"].some((token) => message.includes(token))) {
    return "该视频需要登录、会员权限或受保护，无法解析。";
  }
  return "未能获取可播放地址，请确认链接公开可访问后重试。";
}

async function acquireResolutionSlot() {
  if (activeResolutionCount < MAX_CONCURRENT_RESOLUTIONS) {
    activeResolutionCount += 1;
    return;
  }
  await new Promise<void>((resolve) => resolutionWaiters.push(resolve));
  activeResolutionCount += 1;
}

function releaseResolutionSlot() {
  activeResolutionCount = Math.max(0, activeResolutionCount - 1);
  resolutionWaiters.shift()?.();
}

function cookieHeaderToNetscape(cookie: string) {
  const normalized = cookie.trim();
  if (/^# Netscape HTTP Cookie File/im.test(normalized)) return normalized.endsWith("\n") ? normalized : `${normalized}\n`;
  const rows = normalized.split(/[;\r\n]+/u).map((part) => part.trim()).filter(Boolean).flatMap((part) => {
    const separator = part.indexOf("=");
    if (separator <= 0) return [];
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    return name && value ? [`.douyin.com\tTRUE\t/\tFALSE\t0\t${name}\t${value}`] : [];
  });
  return `# Netscape HTTP Cookie File\n${rows.join("\n")}\n`;
}

async function runYtDlp(url: string, cookie?: string): Promise<Record<string, unknown>> {
  const command = resolveYtDlpCommand();
  let temporaryCookieDir: string | null = null;
  let cookiesPath = resolveVideoBatchCookiesPath(url);
  if (cookie?.trim() && isDouyinUrl(url)) {
    temporaryCookieDir = await mkdtemp(join(tmpdir(), "video-batch-cookie-"));
    cookiesPath = join(temporaryCookieDir, "cookies.txt");
    try {
      await writeFile(cookiesPath, cookieHeaderToNetscape(cookie), { encoding: "utf8", mode: 0o600 });
    } catch (error) {
      await rm(temporaryCookieDir, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  }
  const args = [
    "--dump-single-json",
    "--skip-download",
    "--no-playlist",
    "--no-warnings",
    "--no-cache-dir",
    "--socket-timeout", "15",
    "--format", "bestvideo*+bestaudio/best",
    ...(cookiesPath ? ["--cookies", cookiesPath] : []),
    "--",
    url,
  ];
  try {
    const child = spawn(command.file, [...command.prefix, ...args], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    const appendOutput = (chunks: Buffer[], chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes <= MAX_PROCESS_OUTPUT_BYTES) chunks.push(chunk);
    };
    child.stdout.on("data", (chunk) => appendOutput(stdout, Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => appendOutput(stderr, Buffer.from(chunk)));

    const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error("video_batch_resolve_timeout"));
      }, RESOLUTION_TIMEOUT_MS);
      child.once("error", (error) => {
        clearTimeout(timeout);
        if ((error as NodeJS.ErrnoException).code === "ENOENT") reject(new Error("video_batch_binary_missing"));
        else reject(error);
      });
      child.once("close", (code, signal) => {
        clearTimeout(timeout);
        resolve({ code, signal });
      });
    });
    if (outputBytes > MAX_PROCESS_OUTPUT_BYTES) throw new Error("video_batch_output_too_large");
    if (exit.code !== 0) {
      throw new Error(Buffer.concat(stderr).toString("utf8").trim() || `video_batch_resolver_exit_${exit.code ?? exit.signal ?? "unknown"}`);
    }
    try {
      const info = JSON.parse(Buffer.concat(stdout).toString("utf8")) as unknown;
      if (info && typeof info === "object" && !Array.isArray(info)) return info as Record<string, unknown>;
    } catch {
      // Convert malformed resolver output to the same safe failure shown to users.
    }
    throw new Error("resolver_stream_url_missing");
  } finally {
    if (temporaryCookieDir) await rm(temporaryCookieDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function resolveOne(url: string, runner: YtDlpRunner): Promise<VideoBatchTask> {
  await acquireResolutionSlot();
  try {
    const info = await runner(url);
    const streamUrl = typeof info.url === "string" ? info.url.trim() : "";
    const parsed = streamUrl ? new URL(streamUrl) : null;
    if (!parsed || !["http:", "https:"].includes(parsed.protocol)) throw new Error("resolver_stream_url_missing");
    const title = typeof info.title === "string" && info.title.trim() ? info.title.trim() : "已解析视频";
    const requestedFormats = Array.isArray(info.requested_formats) ? info.requested_formats : [];
    const audioFormat = requestedFormats.find((format) => {
      if (!format || typeof format !== "object" || Array.isArray(format)) return false;
      const item = format as Record<string, unknown>;
      return typeof item.url === "string" && item.url.trim() && item.vcodec === "none" && item.acodec !== "none";
    }) as Record<string, unknown> | undefined;
    const audioStreamUrl = typeof audioFormat?.url === "string" ? audioFormat.url.trim() : "";
    return {
      sourceUrl: url,
      status: "ready",
      title,
      error: "",
      streamUrl,
      ...(audioStreamUrl ? { audioStreamUrl } : {}),
    };
  } catch (error) {
    return { sourceUrl: url, status: "failed", title: "解析失败", error: resolveTaskError(error, url), streamUrl: "" };
  } finally {
    releaseResolutionSlot();
  }
}

export async function resolveVideoBatchLinks(input: {
  links: unknown;
  cookie?: string;
  runner?: YtDlpRunner;
}) {
  const urls = extractVideoBatchUrls(input.links);
  const runner = input.runner ?? ((url: string) => runYtDlp(url, input.cookie));
  return Promise.all(urls.map((url) => resolveOne(url, runner)));
}
