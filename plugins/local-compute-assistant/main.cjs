const { app, BrowserWindow, ipcMain } = require("electron");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { randomUUID } = require("node:crypto");

const HOST = "127.0.0.1";
const PORT = Number(process.env.COMIC_AI_LOCAL_COMPUTE_PORT || 48123);
const MAX_UPLOAD_BYTES = Number(process.env.COMIC_AI_LOCAL_COMPUTE_MAX_BYTES || 500 * 1024 * 1024);
const RESULT_TTL_MS = Number(process.env.COMIC_AI_LOCAL_COMPUTE_RESULT_TTL_MS || 60 * 60 * 1000);
const SUPPORTED_SUFFIXES = new Set([".mp4", ".webm", ".mov"]);

let workerWindow = null;
let server = null;
let workDirectory = "";
let rendererReady = false;
let runningJobId = null;
const jobs = new Map();
const queue = [];

function json(response, statusCode, payload, request) {
  const body = Buffer.from(JSON.stringify(payload));
  response.writeHead(statusCode, corsHeaders(request, {
    "content-type": "application/json; charset=utf-8",
    "content-length": body.length,
    "cache-control": "no-store"
  }));
  response.end(body);
}

function corsHeaders(request, headers = {}) {
  const origin = String(request.headers.origin || "");
  if (/^https?:\/\//i.test(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers.vary = "Origin";
    headers["access-control-allow-methods"] = "GET, POST, OPTIONS";
    headers["access-control-allow-headers"] = "Content-Type";
    headers["access-control-allow-private-network"] = "true";
  }
  return headers;
}

function fileNameFromDisposition(value) {
  const match = /filename="([^\"]+)"/i.exec(value || "");
  return match ? path.basename(match[1]) : "input.mp4";
}

function parseMultipartFile(body, contentType) {
  const boundary = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType)?.[1]
    || /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType)?.[2];
  if (!boundary) throw new Error("multipart_file_required");

  const delimiter = Buffer.from(`--${boundary}`);
  let cursor = body.indexOf(delimiter);
  while (cursor !== -1) {
    const next = body.indexOf(delimiter, cursor + delimiter.length);
    if (next === -1) break;
    const part = body.subarray(cursor + delimiter.length + 2, next - 2);
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd !== -1) {
      const headers = part.subarray(0, headerEnd).toString("utf8");
      const disposition = /^content-disposition:\s*(.+)$/im.exec(headers)?.[1] || "";
      if (/\bname="file"/i.test(disposition)) {
        return {
          fileName: fileNameFromDisposition(disposition),
          bytes: part.subarray(headerEnd + 4)
        };
      }
    }
    cursor = next;
  }
  throw new Error("multipart_file_required");
}

async function readRequestBody(request) {
  const contentLength = Number(request.headers["content-length"] || 0);
  if (!Number.isFinite(contentLength) || contentLength <= 0 || contentLength > MAX_UPLOAD_BYTES) {
    throw new Error("video_too_large");
  }
  const chunks = [];
  let received = 0;
  for await (const chunk of request) {
    received += chunk.length;
    if (received > MAX_UPLOAD_BYTES) throw new Error("video_too_large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function submitJob(request, response) {
  const contentType = String(request.headers["content-type"] || "");
  if (!contentType.includes("multipart/form-data")) {
    json(response, 400, { error: "multipart_file_required" }, request);
    return;
  }

  try {
    const input = parseMultipartFile(await readRequestBody(request), contentType);
    const suffix = path.extname(input.fileName).toLowerCase();
    if (!SUPPORTED_SUFFIXES.has(suffix) || input.bytes.length === 0) {
      json(response, 400, { error: "video_format_not_supported" }, request);
      return;
    }

    const id = randomUUID().replaceAll("-", "");
    const jobDirectory = path.join(workDirectory, id);
    await fs.mkdir(jobDirectory, { recursive: true });
    const inputPath = path.join(jobDirectory, `input${suffix}`);
    const outputPath = path.join(jobDirectory, "depth.webm");
    await fs.writeFile(inputPath, input.bytes);
    jobs.set(id, {
      id,
      status: "queued",
      fileName: `${path.basename(input.fileName, suffix)}-depth.webm`,
      inputPath,
      outputPath,
      createdAt: Date.now(),
      error: null
    });
    queue.push(id);
    void processNextJob();
    json(response, 202, { id, status: "queued", statusUrl: `/jobs/${id}`, outputUrl: `/jobs/${id}/output` }, request);
  } catch (error) {
    const code = error?.message === "video_too_large" ? "video_too_large" : "multipart_file_required";
    json(response, code === "video_too_large" ? 413 : 400, { error: code }, request);
  }
}

function processNextJob() {
  if (runningJobId || !rendererReady) return;
  const id = queue.shift();
  if (!id) return;
  const job = jobs.get(id);
  if (!job) {
    void processNextJob();
    return;
  }
  runningJobId = id;
  job.status = "running";
  workerWindow.webContents.send("depth:process", {
    id,
    inputUrl: pathToFileURL(job.inputPath).href,
    fileName: job.fileName
  });
}

async function completeJob(event, result) {
  if (event.sender !== workerWindow.webContents || !result?.id) return;
  const job = jobs.get(result.id);
  if (!job || runningJobId !== result.id) return;

  if (result.ok && typeof result.dataUrl === "string" && result.dataUrl.startsWith("data:video/webm;base64,")) {
    try {
      await fs.writeFile(job.outputPath, Buffer.from(result.dataUrl.split(",", 2)[1], "base64"));
      job.status = "succeeded";
    } catch (error) {
      job.status = "failed";
      job.error = error.message.slice(0, 500);
    }
  } else {
    job.status = "failed";
    job.error = String(result.error || "video_depth_processing_failed").slice(0, 500);
  }
  runningJobId = null;
  void processNextJob();
}

function cleanupJobs() {
  const cutoff = Date.now() - RESULT_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.createdAt >= cutoff || job.status === "running" || job.status === "queued") continue;
    jobs.delete(id);
    void fs.rm(path.dirname(job.inputPath), { recursive: true, force: true });
  }
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${HOST}:${PORT}`);
  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders(request));
    response.end();
    return;
  }
  if (request.method === "GET" && url.pathname === "/health") {
    cleanupJobs();
    json(response, 200, {
      ok: true,
      plugin: "video-depth",
      version: app.getVersion(),
      model: "onnx-community/depth-anything-v2-small",
      device: "webgpu",
      authRequired: false
    }, request);
    return;
  }
  if (request.method === "POST" && url.pathname === "/jobs") {
    await submitJob(request, response);
    return;
  }
  const matched = /^\/jobs\/([a-f0-9]+)(\/output)?$/i.exec(url.pathname);
  if (request.method === "GET" && matched) {
    const job = jobs.get(matched[1]);
    if (!job) {
      json(response, 404, { error: "job_not_found" }, request);
      return;
    }
    if (!matched[2]) {
      json(response, 200, { id: job.id, status: job.status, fileName: job.fileName, error: job.error }, request);
      return;
    }
    if (job.status !== "succeeded") {
      json(response, 409, { error: "job_not_ready", status: job.status }, request);
      return;
    }
    try {
      const stat = await fs.stat(job.outputPath);
      response.writeHead(200, corsHeaders(request, {
        "content-type": "video/webm",
        "content-length": stat.size,
        "content-disposition": `attachment; filename="${job.fileName.replaceAll("\"", "")}"`,
        "cache-control": "no-store"
      }));
      require("node:fs").createReadStream(job.outputPath).pipe(response);
    } catch {
      json(response, 404, { error: "output_not_found" }, request);
    }
    return;
  }
  json(response, 404, { error: "route_not_found" }, request);
}

function createWorkerWindow() {
  workerWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs")
    }
  });
  workerWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  workerWindow.on("close", (event) => event.preventDefault());
}

async function start() {
  workDirectory = path.join(app.getPath("temp"), "comic-ai-local-compute");
  await fs.mkdir(workDirectory, { recursive: true });
  createWorkerWindow();
  ipcMain.on("depth:renderer-ready", (event) => {
    if (event.sender === workerWindow.webContents) {
      rendererReady = true;
      void processNextJob();
    }
  });
  ipcMain.on("depth:complete", completeJob);
  server = http.createServer((request, response) => void handleRequest(request, response));
  server.listen(PORT, HOST, () => console.log(`Comic AI local compute assistant listening on http://${HOST}:${PORT}`));
  server.on("error", (error) => console.error("Local compute assistant HTTP server error:", error.message));
}

app.whenReady().then(start);
app.on("window-all-closed", (event) => event.preventDefault());
app.on("before-quit", () => server?.close());
