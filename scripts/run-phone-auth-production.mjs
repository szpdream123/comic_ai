import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { buildProductionRuntime } from "./build-production-runtime.mjs";
import { buildProductionWeb } from "./build-production-web.mjs";
import { createCreatorDevServiceSupervisor } from "./creator-dev-service-supervisor.mjs";
import { acquireProcessInstanceLock } from "./process-instance-lock.mjs";
import { runRuntimeSchemaMigrations } from "./runtime-schema-migrations.mjs";

const runtime = findNodeRuntime(18);
const envFilePath = join(process.cwd(), ".env");
const productionLockPath = join(process.cwd(), ".local", "run", "comic-ai-production.pid");
const restartRequestFile = join(process.cwd(), ".local", "run", "creator-dev-stack.restart.json");
const productionFoundationSchemaTimeoutMs = 20 * 60_000;

loadDotEnvFile(envFilePath);
acquireProcessInstanceLock(productionLockPath, { label: "production_stack" });
process.env.NODE_ENV = "production";
const productionWeb = await buildProductionWeb({ cwd: process.cwd() });
process.env.PRODUCTION_WEB_ENTRY_URL = productionWeb.entryUrl;
const productionRuntime = await buildProductionRuntime({ cwd: process.cwd() });
runRuntimeSchemaMigrations({ runtime, cwd: process.cwd(), env: process.env });
runProductionFoundationSchema({
  runtime,
  cwd: process.cwd(),
  env: process.env,
  entrypoint: productionRuntime.foundationSchema,
});

for (const key of ["BULLMQ_OUTBOX_DISPATCHER_ENABLED", "BULLMQ_WORKERS_ENABLED"]) {
  if (!isEnabled(process.env[key])) {
    console.error(`[production] ${key}=true is required so the generation chain cannot start partially.`);
    process.exit(1);
  }
}

let stopping = false;
const supervisor = createCreatorDevServiceSupervisor({
  now: () => Date.now(),
  setTimeout,
  clearTimeout,
  maxRestartAttempts: 5,
  spawnProcess(name, args) {
    const child = spawn(runtime, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CREATOR_DEV_STACK_MANAGED: "true",
        CREATOR_DEV_SCHEMA_READY: "true",
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    pipeWithPrefix(child.stdout, name);
    pipeWithPrefix(child.stderr, name);
    return child;
  },
  onRestartScheduled(name, delayMs, code, signal, attempt) {
    if (attempt > 1) return;
    console.error(
      `[production] ${name} exited code=${code ?? "null"} signal=${signal ?? "null"}; restarting in ${delayMs}ms.`,
    );
  },
  onRestartLimitReached(name, attempts, code, signal) {
    console.error(
      `[production] ${name} restart limit reached after ${attempts} attempts (code=${code ?? "null"} signal=${signal ?? "null"}); stopping supervised services.`,
    );
    requestStop("SIGTERM");
    process.exitCode = 1;
  },
  onSpawnError(name, error) {
    console.error(`[production] ${name} failed to spawn: ${error instanceof Error ? error.message : String(error)}`);
  },
  onFatalExit(name, code, signal) {
    console.error(`[production] ${name} stopped code=${code ?? "null"} signal=${signal ?? "null"}.`);
  },
});

function runProductionFoundationSchema({ runtime, cwd, env, entrypoint }) {
  console.info("[schema] Preparing foundation schema before service startup...");
  const result = spawnSync(runtime, [entrypoint], {
    cwd,
    env: {
      ...env,
      CREATOR_DEV_STACK_MANAGED: "false",
      CREATOR_DEV_SCHEMA_READY: "false",
    },
    windowsHide: true,
    stdio: "inherit",
    timeout: productionFoundationSchemaTimeoutMs,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`production_foundation_schema_failed:${result.status ?? "unknown"}`);
  }
  console.info("[schema] Foundation schema is ready.");
}

supervisor.start("comic-ai", [productionRuntime.sharedRuntime], { restartOnFailure: true });
const mediaCrawlerManaged = isEnabled(process.env.MEDIA_CRAWLER_MANAGED ?? "true");
if (mediaCrawlerManaged) {
  supervisor.start("media-crawler", [
    productionRuntime.mediaCrawler,
  ], { restartOnFailure: true });
} else {
  console.info("[production] MEDIA_CRAWLER_MANAGED=false; MediaCrawler must run outside this server.");
}
console.info(
  `[production] Shared API, generation, and Canvas Agent runtime${mediaCrawlerManaged ? ", plus media-crawler," : ","} is supervised.`,
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    requestStop(signal);
  });
}

const restartRequestPoll = setInterval(() => {
  if (!existsSync(restartRequestFile)) return;
  try {
    const request = JSON.parse(readFileSync(restartRequestFile, "utf8"));
    rmSync(restartRequestFile, { force: true });
    for (const name of Array.isArray(request?.services) ? request.services : []) {
      if (typeof name === "string" && supervisor.restart(name)) {
        console.info(`[production] Manual restart requested for ${name}.`);
      }
    }
  } catch (error) {
    rmSync(restartRequestFile, { force: true });
    console.error(`[production] Invalid restart request: ${error instanceof Error ? error.message : String(error)}`);
  }
}, 250);
restartRequestPoll.unref?.();

function requestStop(signal) {
  if (stopping) return;
  stopping = true;
  clearInterval(restartRequestPoll);
  console.info(`[production] Received ${signal}; stopping API and generation services...`);
  supervisor.stop(signal);
  const forceStopTimer = setTimeout(() => {
    console.error("[production] Graceful shutdown exceeded 10s; forcing remaining services to stop.");
    supervisor.forceStop(signal);
    process.exit(1);
  }, 10_000);
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
      if (line.trim()) console.log(`[${name}] ${line}`);
    }
  });
}

function findNodeRuntime(minMajor) {
  const candidates = [];
  const seen = new Set();

  addCandidate(process.execPath);

  const nodeLocator = process.platform === "win32" ? "where.exe" : "which";
  const whereNode = spawnSync(nodeLocator, ["node"], {
    encoding: "utf8",
    windowsHide: true,
  });

  if (whereNode.status === 0) {
    for (const line of whereNode.stdout.split(/\r?\n/)) {
      addCandidate(line.trim());
    }
  }

  for (const candidate of candidates) {
    const version = spawnSync(candidate, ["--version"], {
      encoding: "utf8",
      windowsHide: true,
    });

    if (version.status !== 0) {
      continue;
    }

    const match = version.stdout.trim().match(/^v(\d+)\./);
    if (match && Number(match[1]) >= minMajor) {
      return candidate;
    }
  }

  console.error(`Unable to find a Node.js runtime >= ${minMajor}.`);
  process.exit(1);

  function addCandidate(candidate) {
    if (!candidate || seen.has(candidate)) {
      return;
    }
    seen.add(candidate);
    candidates.push(candidate);
  }
}

function isEnabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}


function loadDotEnvFile(targetEnvFilePath) {
  if (!existsSync(targetEnvFilePath)) {
    return;
  }

  const content = readFileSync(targetEnvFilePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}
