import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Redis from "ioredis";
import { Client } from "pg";

import {
  commandIncludes,
  configuredPort,
  findListenerPid,
  generationQueueEnabled,
  isProjectProcess,
  listWindowsChildProcesses,
  loadDotEnvFile,
  readWindowsProcess,
} from "./creator-dev-process-utils.mjs";
import { runtimeEnvFilePath } from "./runtime-env-file.mjs";

const pidFile = join(process.cwd(), ".local", "run", "creator-dev-stack.pid");
loadDotEnvFile(runtimeEnvFilePath(process.cwd(), { production: false }), { override: true });
const pid = readPidFile(pidFile);
const port = configuredPort();

if (!pid) {
  console.log("creator-dev stack is stopped (no pid file).");
  process.exit(1);
}

const supervisorProcess = readWindowsProcess(pid);
const alive = isProjectProcess(supervisorProcess, process.cwd(), "run-creator-dev-stack.mjs");
const listenerPid = findListenerPid(port);
const listenerProcess = listenerPid ? readWindowsProcess(listenerPid) : null;
const listening = isProjectProcess(listenerProcess, process.cwd(), "run-comic-ai-shared-runtime");
const children = alive ? listWindowsChildProcesses(pid) : [];
const expectedServices = [
  "run-comic-ai-shared-runtime.mjs",
];
if (isEnabled(process.env.MEDIA_CRAWLER_MANAGED ?? "true")) {
  expectedServices.push("run-media-crawler-api.mjs");
}
const missingServices = expectedServices.filter(
  (marker) => !children.some((child) => commandIncludes(child, marker)),
);
const runtimeIssues = alive && listening && missingServices.length === 0
  ? await checkRuntimeConnections({ checkRedis: generationQueueEnabled() })
  : [];

if (alive && listening && missingServices.length === 0 && runtimeIssues.length === 0) {
  console.log(`creator-dev stack is running (pid=${pid}, port=${port})`);
  process.exit(0);
}

console.log(
  `creator-dev stack is unhealthy (pid=${pid}, alive=${alive}, port=${port}, listening=${listening}, `
  + `missing=${missingServices.join(",") || "none"}, runtime=${runtimeIssues.join(";") || "none"})`,
);
process.exit(1);

async function checkRuntimeConnections(input) {
  const issues = [];
  await Promise.all([
    checkPostgres().catch((error) => {
      issues.push(`DATABASE_URL(PostgreSQL):${safeErrorCode(error)}`);
    }),
    input.checkRedis
      ? checkRedis().catch((error) => {
          issues.push(`REDIS_URL(Redis):${safeErrorCode(error)}`);
        })
      : Promise.resolve(),
  ]);
  return issues;
}

async function checkPostgres() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw Object.assign(new Error("DATABASE_URL is required"), { code: "MISSING" });
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: configuredDatabaseConnectionTimeout(),
  });
  try {
    await client.connect();
    await client.query("SELECT 1");
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function checkRedis() {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) throw Object.assign(new Error("REDIS_URL is required"), { code: "MISSING" });
  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    connectTimeout: 2_000,
    commandTimeout: 5_000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  redis.on("error", () => undefined);
  try {
    await redis.connect();
    await redis.ping();
  } finally {
    redis.disconnect();
  }
}

function configuredDatabaseConnectionTimeout() {
  const rawValue = process.env.DATABASE_POOL_CONNECTION_TIMEOUT_MS?.trim() ?? "5000";
  const value = Number(rawValue);
  if (!/^\d+$/.test(rawValue) || !Number.isSafeInteger(value) || value < 1 || value > 60_000) {
    throw Object.assign(new Error("invalid database connection timeout"), { code: "INVALID_DATABASE_POOL_CONNECTION_TIMEOUT_MS" });
  }
  return value;
}

function safeErrorCode(error) {
  if (error && typeof error === "object" && "code" in error && error.code) {
    return String(error.code);
  }
  return error instanceof Error ? error.name : "CONNECTION_ERROR";
}

function isEnabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function readPidFile(path) {
  if (!existsSync(path)) return null;
  const value = readFileSync(path, "utf8").trim();
  const pid = Number(value);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}
