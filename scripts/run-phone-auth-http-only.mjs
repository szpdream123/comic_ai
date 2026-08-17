import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const runtime = findNodeRuntime(18);
const envFilePath = join(process.cwd(), ".env");
const launcherPath = join(process.cwd(), "scripts", "run-phone-auth-dev-server.mjs");

loadDotEnvFile(envFilePath);
process.env.GENERATION_QUEUE_REQUIRED = "false";
process.env.BULLMQ_OUTBOX_DISPATCHER_ENABLED = "false";
process.env.BULLMQ_WORKERS_ENABLED = "false";
process.env.PHONE_AUTH_HTTP_ONLY = "true";

const result = spawnSync(runtime, [launcherPath], {
  env: process.env,
  windowsHide: true,
  stdio: "inherit",
});

process.exit(result.status ?? 1);

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
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}
