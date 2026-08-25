import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { runRuntimeSchemaMigrations } from "./runtime-schema-migrations.mjs";
import { runtimeEnvFilePath } from "./runtime-env-file.mjs";

const runtime = findNodeRuntime(18);
const serverEntrypoint = join(
  process.cwd(),
  "apps",
  "backend",
  "src",
  "entrypoints",
  "phone-auth-dev-server.ts",
);
const envFilePath = runtimeEnvFilePath(process.cwd(), { production: false });

if (!existsSync(serverEntrypoint)) {
  console.error(`Unable to find dev server entrypoint at ${serverEntrypoint}`);
  process.exit(1);
}

loadDotEnvFile(envFilePath, { override: true });
if (process.env.NODE_ENV === "production") {
  console.error("Refusing to start phone-auth dev server with NODE_ENV=production.");
  process.exit(1);
}
if (process.env.PHONE_AUTH_HTTP_ONLY === "true") {
  process.env.GENERATION_QUEUE_REQUIRED = "false";
  process.env.BULLMQ_OUTBOX_DISPATCHER_ENABLED = "false";
  process.env.BULLMQ_WORKERS_ENABLED = "false";
}
const generationQueueRequired =
  isEnabled(process.env.GENERATION_QUEUE_REQUIRED) ||
  isEnabled(process.env.BULLMQ_OUTBOX_DISPATCHER_ENABLED) ||
  isEnabled(process.env.BULLMQ_WORKERS_ENABLED);
if (generationQueueRequired) {
  process.env.GENERATION_QUEUE_REQUIRED = "true";
  process.env.BULLMQ_OUTBOX_DISPATCHER_ENABLED = "true";
  process.env.BULLMQ_WORKERS_ENABLED = "true";
}
if (generationQueueRequired && process.env.CREATOR_DEV_STACK_MANAGED !== "true") {
  const stackEntrypoint = join(process.cwd(), "scripts", "run-creator-dev-stack.mjs");
  console.error(
    "[phone-auth] GENERATION_QUEUE_REQUIRED=true; starting the full dev stack so generation-outbox and generation-worker are always running.",
  );
  console.error("[phone-auth] Use npm run dev:http-only when you intentionally want HTTP-only mode.");
  const stackResult = spawnSync(runtime, [stackEntrypoint], {
    env: process.env,
    windowsHide: true,
    stdio: "inherit",
  });
  process.exit(stackResult.status ?? 1);
}
if (process.env.CREATOR_DEV_STACK_MANAGED !== "true") {
  runRuntimeSchemaMigrations({ runtime, cwd: process.cwd(), env: process.env });
}
const serverArgs = [
    ...resolveTsxRuntimeArgs(runtime),
    "--input-type=module",
    "--eval",
    `import(${JSON.stringify(pathToFileUrl(serverEntrypoint))}).then(async ({ createPhoneAuthDevServer }) => {
      const listenWithRetry = async (server, port, attempts = 20, delayMs = 500) => {
        let lastError = null;
        for (let attempt = 1; attempt <= attempts; attempt += 1) {
          try {
            await server.listen(port);
            return;
          } catch (error) {
            lastError = error;
            const code = error instanceof Error ? error.code : undefined;
            if (code !== "EADDRINUSE" || attempt === attempts) {
              throw error;
            }
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
        }
        throw lastError ?? new Error("listen_retry_exhausted");
      };
      const server = createPhoneAuthDevServer({
        seedTeamEntitlements: process.env.SEED_TEAM_ENTITLEMENTS === "true",
      });
      const port = Number(process.env.PORT ?? "4310");
      await listenWithRetry(server, port);
      console.log("Phone auth dev server listening on " + server.origin);
      const keepAlive = setInterval(() => {}, 1000);
      let stopping = false;
      const requestStop = async (signal) => {
        if (stopping) return;
        stopping = true;
        clearInterval(keepAlive);
        console.log("Phone auth dev server received " + signal + ", closing...");
        await server.close();
        console.log("Phone auth dev server stopped.");
        process.exit(0);
      };
      process.on("message", (message) => {
        if (message?.type === "creator-dev-stop") {
          void requestStop(message.signal ?? "SIGTERM").catch((error) => {
            console.error(error);
            process.exitCode = 1;
          });
        }
      });
      for (const signal of ["SIGINT", "SIGTERM"]) {
        process.once(signal, () => {
          void requestStop(signal).catch((error) => {
            console.error(error);
            process.exitCode = 1;
          });
        });
      }
    }).catch((error) => {
      console.error(error);
      process.exit(1);
    });`,
  ];
const child = spawn(runtime, serverArgs, {
  env: process.env,
  windowsHide: true,
  stdio: ["inherit", "inherit", "inherit", "ipc"],
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => forwardStop(signal));
}
process.on("message", (message) => {
  if (message?.type === "creator-dev-stop") forwardStop(message.signal ?? "SIGTERM");
});

const exit = await new Promise((resolve) => {
  child.once("error", (error) => resolve({ code: 1, error }));
  child.once("exit", (code, signal) => resolve({ code, signal }));
});
if (exit.error) console.error(exit.error);
process.exitCode = exit.code ?? (exit.signal ? 1 : 0);

function forwardStop(signal) {
  if (child.killed) return;
  if (child.connected) {
    child.send({ type: "creator-dev-stop", signal }, (error) => {
      if (error && !child.killed) child.kill(signal);
      else if (child.connected) child.disconnect();
    });
  } else {
    child.kill(signal);
  }
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

function resolveTsxRuntimeArgs(runtime) {
  const version = spawnSync(runtime, ["--version"], {
    encoding: "utf8",
    windowsHide: true,
  });

  if (version.status !== 0) {
    return ["--loader", "tsx"];
  }

  const match = version.stdout.trim().match(/^v(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return ["--loader", "tsx"];
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (major > 18 || (major === 18 && minor >= 19)) {
    return ["--import", "tsx"];
  }

  return ["--loader", "tsx"];
}
function loadDotEnvFile(envFilePath, options = {}) {
  if (!existsSync(envFilePath)) {
    return;
  }

  const content = readFileSync(envFilePath, "utf8");
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
    if (!key) {
      continue;
    }

    if (process.env[key] !== undefined && options.override !== true) {
      continue;
    }

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
