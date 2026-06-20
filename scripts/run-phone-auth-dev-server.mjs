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

loadDotEnvFile(envFilePath);
if (process.env.LOCAL_DATABASE_DIR?.trim() && !process.env.ALLOW_PHONE_AUTH_DEV_SERVER_REMOTE_DATABASE) {
  delete process.env.DATABASE_URL;
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
  console.error("[phone-auth] Use GENERATION_QUEUE_REQUIRED=false only when you intentionally want HTTP-only mode.");
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
if (!isSafeDevServerDatabaseUrl(process.env.DATABASE_URL)) {
  console.error("Refusing to start phone-auth dev server with a non-local DATABASE_URL.");
  process.exit(1);
}
if (!process.env.LOCAL_DATABASE_DIR?.trim()) {
  const port = process.env.PORT?.trim() || "4310";
  process.env.LOCAL_DATABASE_DIR = `.local/dev-db/phone-auth-${port}`;
}

const result = spawnSync(
  runtime,
  [
    ...resolveTsxRuntimeArgs(runtime),
    "--input-type=module",
    "--eval",
    `import(${JSON.stringify(pathToFileUrl(serverEntrypoint))}).then(async ({ createPhoneAuthDevServer }) => {
      const server = createPhoneAuthDevServer({
        seedTeamEntitlements: process.env.SEED_TEAM_ENTITLEMENTS === "true",
      });
      const port = Number(process.env.PORT ?? "4310");
      await server.listen(port);
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

function loadDotEnvFile(envFilePath) {
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
    if (!key || process.env[key] !== undefined) {
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

function isSafeDevServerDatabaseUrl(databaseUrl) {
  const value = databaseUrl?.trim();
  if (!value) {
    return true;
  }
  if (process.env.ALLOW_PHONE_AUTH_DEV_SERVER_REMOTE_DATABASE === "true") {
    return true;
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}
