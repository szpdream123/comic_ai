import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import net from "node:net";
import { join } from "node:path";

const runtime = findNodeRuntime(18);
const envFilePath = join(process.cwd(), ".env");
const logDir = join(process.cwd(), ".local", "logs");

loadDotEnvFile(envFilePath);
mkdirSync(logDir, { recursive: true });

process.env.BULLMQ_OUTBOX_DISPATCHER_ENABLED ??= "true";
process.env.BULLMQ_WORKERS_ENABLED ??= "true";

const redisUrl = new URL(process.env.REDIS_URL?.trim() || "redis://127.0.0.1:6379/0");
const redisHost = redisUrl.hostname || "127.0.0.1";
const redisPort = Number(redisUrl.port || 6379);
const generationQueueEnabled = isEnabled(process.env.BULLMQ_OUTBOX_DISPATCHER_ENABLED) ||
  isEnabled(process.env.BULLMQ_WORKERS_ENABLED);

if (generationQueueEnabled) {
  const redisReady = await canConnect(redisHost, redisPort, 1500);
  if (!redisReady) {
    console.error("");
    console.error("[creator-dev] Redis is required for generation queues but is not reachable.");
    console.error(`[creator-dev] Expected Redis at ${redisHost}:${redisPort} from REDIS_URL.`);
    console.error("[creator-dev] Start Redis first, then run this command again.");
    console.error("[creator-dev] Without Redis, generation tasks stay at: 等待模型接收.");
    console.error("");
    process.exit(1);
  }
}

const children = [];
let stopping = false;

startService("phone-auth", ["scripts/run-phone-auth-dev-server.mjs"]);

if (generationQueueEnabled) {
  startService("generation-outbox", [
    ...resolveTsxRuntimeArgs(runtime),
    "scripts/run-generation-outbox-dispatcher.mjs",
  ]);
  startService("generation-worker", [
    ...resolveTsxRuntimeArgs(runtime),
    "scripts/run-generation-video-worker.mjs",
  ]);
} else {
  console.warn("[creator-dev] Generation queues are disabled. Model tasks will run only through synchronous fallback paths.");
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    stopping = true;
    console.info(`[creator-dev] Received ${signal}, stopping dev stack...`);
    for (const child of children.toReversed()) {
      child.kill(signal);
    }
  });
}

function startService(name, args) {
  const child = spawn(runtime, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  pipeWithPrefix(child.stdout, name);
  pipeWithPrefix(child.stderr, name);
  child.on("exit", (code, signal) => {
    const cleanExit = stopping || signal === "SIGTERM" || signal === "SIGINT";
    if (cleanExit) {
      return;
    }
    console.error(`[creator-dev] ${name} exited unexpectedly with code=${code ?? "null"} signal=${signal ?? "null"}`);
    stopping = true;
    for (const sibling of children) {
      if (sibling !== child && !sibling.killed) {
        sibling.kill("SIGTERM");
      }
    }
    process.exitCode = code ?? 1;
  });
}

function pipeWithPrefix(stream, name) {
  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) {
        console.log(`[${name}] ${line}`);
      }
    }
  });
}

function canConnect(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.end();
      resolve(true);
    });
    socket.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

function findNodeRuntime(minMajor) {
  const candidates = [];
  const seen = new Set();

  addCandidate(process.execPath);

  const nodeLocator = process.platform === "win32" ? "where.exe" : "which";
  const whereNode = spawnSync(nodeLocator, ["node"], { encoding: "utf8" });

  if (whereNode.status === 0) {
    for (const line of whereNode.stdout.split(/\r?\n/)) {
      addCandidate(line.trim());
    }
  }

  for (const candidate of candidates) {
    const version = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (version.status !== 0) continue;
    const match = version.stdout.trim().match(/^v(\d+)\./);
    if (match && Number(match[1]) >= minMajor) {
      return candidate;
    }
  }

  console.error(`Unable to find a Node.js runtime >= ${minMajor}.`);
  process.exit(1);

  function addCandidate(candidate) {
    if (!candidate || seen.has(candidate)) return;
    seen.add(candidate);
    candidates.push(candidate);
  }
}

function resolveTsxRuntimeArgs(runtimePath) {
  const version = spawnSync(runtimePath, ["--version"], { encoding: "utf8" });
  if (version.status !== 0) return ["--loader", "tsx"];
  const match = version.stdout.trim().match(/^v(\d+)\.(\d+)\.(\d+)/);
  if (!match) return ["--loader", "tsx"];
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 18 || (major === 18 && minor >= 19)
    ? ["--import", "tsx"]
    : ["--loader", "tsx"];
}

function loadDotEnvFile(path) {
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function isEnabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}
