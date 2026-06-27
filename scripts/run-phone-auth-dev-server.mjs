import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

if (!existsSync(serverEntrypoint)) {
  console.error(`Unable to find dev server entrypoint at ${serverEntrypoint}`);
  process.exit(1);
}

loadDotEnvFile(envFilePath, { override: true });
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
    stdio: "inherit",
  });
  process.exit(stackResult.status ?? 1);
}
if (process.env.NODE_ENV === "production") {
  console.error("Refusing to start phone-auth dev server with NODE_ENV=production.");
  process.exit(1);
}
const result = spawnSync(
  runtime,
  [
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
      setInterval(() => {}, 1000);
    }).catch((error) => {
      console.error(error);
      process.exit(1);
    });`,
  ],
  {
    env: process.env,
    stdio: "inherit",
  },
);

process.exit(result.status ?? 1);

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

function resolveTsxRuntimeArgs(runtime) {
  const version = spawnSync(runtime, ["--version"], {
    encoding: "utf8",
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
