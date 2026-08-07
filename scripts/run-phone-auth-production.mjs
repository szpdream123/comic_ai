import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { buildProductionRuntime } from "./build-production-runtime.mjs";
import { createCreatorDevServiceSupervisor } from "./creator-dev-service-supervisor.mjs";
import { acquireProcessInstanceLock } from "./process-instance-lock.mjs";
import { runRuntimeSchemaMigrations } from "./runtime-schema-migrations.mjs";

const runtime = findNodeRuntime(18);
const serverEntrypoint = join(
  process.cwd(),
  "apps",
  "backend",
  "src",
  "entrypoints",
  "phone-auth-dev-server.ts",
);
const envFilePath = join(process.cwd(), ".env");
const productionLockPath = join(process.cwd(), ".local", "run", "comic-ai-production.pid");
const productionFoundationSchemaTimeoutMs = 20 * 60_000;

if (!existsSync(serverEntrypoint)) {
  console.error(`Unable to find production server entrypoint at ${serverEntrypoint}`);
  process.exit(1);
}

loadDotEnvFile(envFilePath);
acquireProcessInstanceLock(productionLockPath, { label: "production_stack" });
process.env.NODE_ENV = "production";
const productionRuntime = await buildProductionRuntime({ cwd: process.cwd() });
runRuntimeSchemaMigrations({ runtime, cwd: process.cwd(), env: process.env });
runProductionFoundationSchema({
  runtime,
  cwd: process.cwd(),
  env: process.env,
  entrypoint: productionRuntime.foundationSchema,
});

const listenHost = (process.env.HOST ?? "0.0.0.0").trim() || "0.0.0.0";
const publicHost = (process.env.PUBLIC_HOST ?? listenHost).trim() || listenHost;
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

supervisor.start("phone-auth", productionApiArgs(productionRuntime.phoneAuth), { restartOnFailure: true });
supervisor.start("generation-outbox", [
  productionRuntime.generationOutbox,
], { restartOnFailure: true });
supervisor.start("generation-repair", [
  productionRuntime.generationRepair,
], { restartOnFailure: true });
supervisor.start("generation-worker", [
  productionRuntime.generationWorker,
], { restartOnFailure: true });
supervisor.start("canvas-agent", [
  productionRuntime.canvasAgent,
], { restartOnFailure: true });
console.info(
  "[production] API, generation-outbox, generation-repair, generation-worker, and canvas-agent are supervised.",
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    requestStop(signal);
  });
}

function requestStop(signal) {
  if (stopping) return;
  stopping = true;
  console.info(`[production] Received ${signal}; stopping API and generation services...`);
  supervisor.stop(signal);
  const forceStopTimer = setTimeout(() => {
    console.error("[production] Graceful shutdown exceeded 10s; forcing remaining services to stop.");
    supervisor.forceStop(signal);
    process.exit(1);
  }, 10_000);
  forceStopTimer.unref?.();
}

function productionApiArgs(serverEntrypoint) {
  return [
    "--input-type=module",
    "--eval",
    `import(${JSON.stringify(pathToFileUrl(serverEntrypoint))}).then(async ({ createPhoneAuthDevServer }) => {
      const server = createPhoneAuthDevServer({
        allowProduction: true,
        allowLocalDatabaseUrl: true,
        listenHost: ${JSON.stringify(listenHost)},
        seedTeamEntitlements: false,
      });
      const port = Number(process.env.PORT ?? "4310");
      await server.listen(port);
      console.log("Phone auth production server listening on http://${publicHost}:" + port);
      let closing = false;
      for (const signal of ["SIGINT", "SIGTERM"]) {
        process.once(signal, async () => {
          if (closing) return;
          closing = true;
          await server.close().catch((error) => console.error(error));
          process.exit(0);
        });
      }
    }).catch((error) => {
      console.error(error);
      process.exit(1);
    });`,
  ];
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

function pathToFileUrl(filePath) {
  return `file:///${filePath.replace(/\\/g, "/")}`;
}

function findNodeRuntime(minMajor) {
  const candidates = [];
  const seen = new Set();

  addCandidate(process.execPath);

  const nodeLocator = process.platform === "win32" ? "where.exe" : "which";
  const whereNode = spawnSync(nodeLocator, ["node"], {
    encoding: "utf8",
  });

  if (whereNode.status === 0) {
    for (const line of whereNode.stdout.split(/\r?\n/)) {
      addCandidate(line.trim());
    }
  }

  for (const candidate of candidates) {
    const version = spawnSync(candidate, ["--version"], {
      encoding: "utf8",
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
