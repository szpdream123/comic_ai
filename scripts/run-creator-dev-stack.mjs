import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { createCreatorDevServiceSupervisor } from "./creator-dev-service-supervisor.mjs";
import { runRuntimeSchemaMigrations } from "./runtime-schema-migrations.mjs";
import { runtimeEnvFilePath } from "./runtime-env-file.mjs";

const runtime = findNodeRuntime(18);
const envFilePath = runtimeEnvFilePath(process.cwd(), { production: false });
const logDir = join(process.cwd(), ".local", "logs");
const runDir = join(process.cwd(), ".local", "run");
const stopRequestFile = join(runDir, "creator-dev-stack.stop");
const foundationSchemaEntrypoint = join(
  process.cwd(),
  "apps",
  "backend",
  "src",
  "entrypoints",
  "production-foundation-schema.ts",
);
const devFoundationSchemaTimeoutMs = 20 * 60_000;

loadDotEnvFile(envFilePath, { override: true });
runRuntimeSchemaMigrations({ runtime, cwd: process.cwd(), env: process.env });
runDevFoundationSchema({ runtime, cwd: process.cwd(), env: process.env });
mkdirSync(logDir, { recursive: true });
mkdirSync(runDir, { recursive: true });
rmSync(stopRequestFile, { force: true });

process.env.BULLMQ_OUTBOX_DISPATCHER_ENABLED ??= "true";
process.env.BULLMQ_WORKERS_ENABLED ??= "true";
process.env.GENERATION_QUEUE_REQUIRED ??= "true";

const generationQueueEnabled = isEnabled(process.env.BULLMQ_OUTBOX_DISPATCHER_ENABLED) ||
  isEnabled(process.env.BULLMQ_WORKERS_ENABLED);
const mediaCrawlerManaged = isEnabled(process.env.MEDIA_CRAWLER_MANAGED ?? "true");

let stopping = false;
let stopRequestPoll = null;
const supervisor = createCreatorDevServiceSupervisor({
  now: () => Date.now(),
  setTimeout,
  clearTimeout,
  maxRestartAttempts: 3,
  spawnProcess(name, args) {
    const child = spawn(runtime, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CREATOR_DEV_STACK_MANAGED: "true",
        CREATOR_DEV_SCHEMA_READY: "true",
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    pipeWithPrefix(child.stdout, name);
    pipeWithPrefix(child.stderr, name);
    return child;
  },
  onRestartScheduled(name, delayMs, code, signal, attempt) {
    if (attempt > 1) return;
    console.error(
      `[creator-dev] ${name} exited unexpectedly with code=${code ?? "null"} signal=${signal ?? "null"}; restarting in ${delayMs}ms`,
    );
  },
  onRestartLimitReached(name, attempts, code, signal) {
    console.error(
      `[creator-dev] ${name} restart limit reached after ${attempts} attempts (code=${code ?? "null"} signal=${signal ?? "null"}); stopping the dev stack.`,
    );
    requestStackStop("restart-limit", "SIGTERM");
    process.exitCode = 1;
  },
  onFatalExit(name, code, signal) {
    console.error(`[creator-dev] ${name} exited unexpectedly with code=${code ?? "null"} signal=${signal ?? "null"}`);
    requestStackStop(`fatal:${name}`, "SIGTERM");
    process.exitCode = code ?? 1;
  },
});

function runDevFoundationSchema({ runtime, cwd, env }) {
  console.info("[schema] Preparing foundation schema before service startup...");
  const result = spawnSync(runtime, [
    ...resolveTsxRuntimeArgs(runtime),
    foundationSchemaEntrypoint,
  ], {
    cwd,
    env: {
      ...env,
      CREATOR_DEV_STACK_MANAGED: "false",
      CREATOR_DEV_SCHEMA_READY: "false",
    },
    windowsHide: true,
    stdio: "inherit",
    timeout: devFoundationSchemaTimeoutMs,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`dev_foundation_schema_failed:${result.status ?? "unknown"}`);
  }
  console.info("[schema] Foundation schema is ready.");
}

supervisor.start("phone-auth", ["scripts/run-phone-auth-dev-server.mjs"]);
if (mediaCrawlerManaged) {
  supervisor.start("media-crawler", ["scripts/run-media-crawler-api.mjs"], { restartOnFailure: true });
} else {
  console.info("[creator-dev] MEDIA_CRAWLER_MANAGED=false; MediaCrawler must run outside this server.");
}
if (generationQueueEnabled) {
  supervisor.start("generation-outbox", [
    ...resolveTsxRuntimeArgs(runtime),
    "scripts/run-generation-outbox-dispatcher.mjs",
  ], { restartOnFailure: true });
  supervisor.start("generation-repair", [
    ...resolveTsxRuntimeArgs(runtime),
    "scripts/run-generation-queue-maintenance.mjs",
  ], { restartOnFailure: true });
  supervisor.start("generation-worker", [
    ...resolveTsxRuntimeArgs(runtime),
    "scripts/run-generation-video-worker.mjs",
  ], { restartOnFailure: true });
  supervisor.start("canvas-agent", [
    ...resolveTsxRuntimeArgs(runtime),
    "scripts/run-canvas-agent-worker.mjs",
  ], { restartOnFailure: true });
} else {
  console.warn("[creator-dev] Generation queues are disabled. Model tasks will run only through synchronous fallback paths.");
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    requestStackStop(signal, signal);
  });
}

stopRequestPoll = setInterval(() => {
  if (!existsSync(stopRequestFile)) return;
  rmSync(stopRequestFile, { force: true });
  requestStackStop("background-stop-request", "SIGTERM");
}, 250);

function requestStackStop(reason, signal) {
  if (stopping) return;
  stopping = true;
  if (stopRequestPoll) clearInterval(stopRequestPoll);
  console.info(`[creator-dev] Received ${reason}, stopping dev stack...`);
  supervisor.stop(signal);
  const forceStopTimer = setTimeout(() => supervisor.forceStop(signal), 10_000);
  forceStopTimer.unref?.();
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
        console.log(`[${new Date().toISOString()}] [${name}] ${line}`);
      }
    }
  });
}

function findNodeRuntime(minMajor) {
  const candidates = [];
  const seen = new Set();

  addCandidate(process.execPath);

  const nodeLocator = process.platform === "win32" ? "where.exe" : "which";
  const whereNode = spawnSync(nodeLocator, ["node"], { encoding: "utf8", windowsHide: true });

  if (whereNode.status === 0) {
    for (const line of whereNode.stdout.split(/\r?\n/)) {
      addCandidate(line.trim());
    }
  }

  for (const candidate of candidates) {
    const version = spawnSync(candidate, ["--version"], { encoding: "utf8", windowsHide: true });
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
  const version = spawnSync(runtimePath, ["--version"], { encoding: "utf8", windowsHide: true });
  if (version.status !== 0) return ["--loader", "tsx"];
  const match = version.stdout.trim().match(/^v(\d+)\.(\d+)\.(\d+)/);
  if (!match) return ["--loader", "tsx"];
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 18 || (major === 18 && minor >= 19)
    ? ["--import", "tsx"]
    : ["--loader", "tsx"];
}

function loadDotEnvFile(path, options = {}) {
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    if (!key) continue;
    if (process.env[key] !== undefined && options.override !== true) continue;
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
