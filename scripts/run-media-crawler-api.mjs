import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const crawlerRoot = resolve(process.env.MEDIA_CRAWLER_ROOT?.trim() || join(process.cwd(), "..", "MediaCrawler"));
const host = process.env.MEDIA_CRAWLER_HOST?.trim() || "127.0.0.1";
const port = portNumber(process.env.MEDIA_CRAWLER_PORT, 4312);
const uvCommand = process.env.MEDIA_CRAWLER_UV_COMMAND?.trim() || "uv";

if (!existsSync(join(crawlerRoot, "api", "main.py"))) {
  throw new Error(`MediaCrawler was not found at ${crawlerRoot}`);
}

const child = spawn(uvCommand, ["run", "uvicorn", "api.main:app", "--host", host, "--port", String(port)], {
  cwd: crawlerRoot,
  env: { ...process.env, PYTHONUNBUFFERED: "1" },
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
pipeWithPrefix(child.stdout, "media-crawler");
pipeWithPrefix(child.stderr, "media-crawler");

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => requestStop(signal));
process.on("message", (message) => {
  if (message?.type === "creator-dev-stop") requestStop(message.signal ?? "SIGTERM");
});

child.once("error", (error) => {
  console.error(`[media-crawler] Unable to start: ${error.message}`);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  if (!stopping) console.error(`[media-crawler] API stopped with code=${code ?? "null"} signal=${signal ?? "null"}`);
  process.exitCode = code ?? (stopping ? 0 : 1);
});

await waitForHealth(`http://${host}:${port}/api/health`, child);
console.info(`[media-crawler] API started on http://${host}:${port}`);

function requestStop(signal) {
  if (stopping) return;
  stopping = true;
  if (!child.killed) child.kill(signal);
  const forceStopTimer = setTimeout(() => {
    if (!child.killed) child.kill("SIGKILL");
  }, 10_000);
  forceStopTimer.unref?.();
}

async function waitForHealth(url, processHandle) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) throw new Error("media_crawler_api_exited_before_ready");
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The first launch may install the isolated Python environment.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  requestStop("SIGTERM");
  throw new Error("media_crawler_api_start_timeout");
}

function pipeWithPrefix(stream, name) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    for (const line of chunk.split(/\r?\n/)) {
      if (line.trim()) console.log(`[${name}] ${line}`);
    }
  });
}

function portNumber(value, fallback) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error("MEDIA_CRAWLER_PORT must be an integer between 1 and 65535");
  }
  return parsed;
}
