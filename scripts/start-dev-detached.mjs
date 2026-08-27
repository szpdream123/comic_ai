import { spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, rmSync, statSync, writeFileSync, writeSync } from "node:fs";
import { join } from "node:path";

import {
  configuredPort,
  findListenerPid,
  generationQueueEnabled,
  isProjectProcess,
  loadDotEnvFile,
  readWindowsProcess,
} from "./creator-dev-process-utils.mjs";
import { runtimeEnvFilePath } from "./runtime-env-file.mjs";

const runtime = findNodeRuntime(18);
const runDir = join(process.cwd(), ".local", "run");
const logDir = join(process.cwd(), ".local", "logs");
const pidFile = join(runDir, "creator-dev-stack.pid");
const startLockFile = join(runDir, "creator-dev-stack.start.lock");
const outLog = join(logDir, "creator-dev-stack.out.log");
const errLog = join(logDir, "creator-dev-stack.err.log");
const projectRoot = process.cwd();
const stackEntrypoint = join(projectRoot, "scripts", "run-creator-dev-stack.mjs");
const statusEntrypoint = join(projectRoot, "scripts", "status-dev-detached.mjs");
const stopRequestFile = join(runDir, "creator-dev-stack.stop");

loadDotEnvFile(runtimeEnvFilePath(projectRoot, { production: false }), { override: true });
const port = configuredPort();

mkdirSync(runDir, { recursive: true });
mkdirSync(logDir, { recursive: true });

const releaseStartLock = acquireStartLock(startLockFile);
process.once("exit", releaseStartLock);

const existingPid = readPidFile(pidFile);
const existingProcess = existingPid ? readWindowsProcess(existingPid) : null;
if (existingProcess && isProjectProcess(existingProcess, projectRoot, "run-creator-dev-stack.mjs")) {
  const status = readStackStatus(runtime, statusEntrypoint);
  if (status.ready) {
    console.log(`creator-dev stack already running (pid=${existingPid})`);
    process.exit(0);
  }
  console.error(`creator-dev stack is already running but unhealthy: ${status.output}`);
  process.exit(1);
}

if (existingPid) {
  rmSync(pidFile, { force: true });
}

const listenerPid = findListenerPid(port);
if (listenerPid) {
  const listenerProcess = readWindowsProcess(listenerPid);
  if (!isProjectProcess(listenerProcess, projectRoot, "phone-auth-dev-server")) {
    console.error(`Port ${port} is occupied by a process outside this project (pid=${listenerPid}).`);
    process.exit(1);
  }
  terminateProcessTree(listenerPid);
  await waitForPortRelease(port, 10_000);
}

rmSync(stopRequestFile, { force: true });
rotateLog(outLog, 5 * 1024 * 1024);
rotateLog(errLog, 5 * 1024 * 1024);
const outFd = openSync(outLog, "a");
const errFd = openSync(errLog, "a");
const sessionStartedAt = new Date().toISOString();
writeSync(outFd, `\n[creator-dev] ===== session ${sessionStartedAt} =====\n`);
writeSync(errFd, `\n[creator-dev] ===== session ${sessionStartedAt} =====\n`);
const child = spawnDetached(runtime, [stackEntrypoint], outFd, errFd);

writeFileSync(pidFile, `${child.pid}\n`, "utf8");
const readiness = await waitForStackReady({
  childPid: child.pid,
  runtime,
  statusEntrypoint,
  outLog,
  sessionStartedAt,
  timeoutMs: 90_000,
});
if (!readiness.ready) {
  terminateProcessTree(child.pid);
  rmSync(pidFile, { force: true });
  releaseStartLock();
  console.error(`Creator-dev stack failed to become ready: ${readiness.lastStatus}`);
  console.error(`Logs: ${outLog}`);
  process.exit(1);
}
releaseStartLock();
console.log(`Creator-dev stack is ready (pid=${child.pid}, port=${port})`);
console.log(`Logs: ${outLog}`);

function spawnDetached(command, args, outFd, errFd) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", outFd, errFd],
  });
  child.unref();
  return child;
}

function readPidFile(path) {
  if (!existsSync(path)) return null;
  const value = readFileSync(path, "utf8").trim();
  const pid = Number(value);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function acquireStartLock(path) {
  for (;;) {
    try {
      const fd = openSync(path, "wx");
      writeFileSync(fd, `${process.pid}\n`, "utf8");
      let released = false;
      return () => {
        if (released) return;
        released = true;
        closeSync(fd);
        rmSync(path, { force: true });
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const lockPid = readPidFile(path);
      if (lockPid && isProcessAlive(lockPid)) {
        console.log(`creator-dev stack start already in progress (pid=${lockPid})`);
        process.exit(0);
      }
      rmSync(path, { force: true });
    }
  }
}

function isProcessAlive(pid) {
  const result = spawnSync(
    "cmd.exe",
    ["/c", "tasklist", "/FI", `PID eq ${pid}`],
    { encoding: "utf8", windowsHide: true },
  );
  return result.status === 0 && result.stdout.includes(String(pid));
}

function terminateProcessTree(pid) {
  const result = spawnSync(
    "cmd.exe",
    ["/c", "taskkill", "/PID", String(pid), "/T", "/F"],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.status !== 0) {
    console.warn(result.stdout.trim() || result.stderr.trim() || `Unable to stop existing listener pid=${pid}`);
  } else {
    console.log(`Stopped existing listener pid=${pid}`);
  }
}

function rotateLog(path, maxBytes) {
  if (!existsSync(path) || statSync(path).size < maxBytes) return;
  const previous = `${path}.previous`;
  rmSync(previous, { force: true });
  renameSync(path, previous);
}

function waitForPortRelease(port, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!findListenerPid(port)) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
}

async function waitForStackReady(input) {
  const startedAt = Date.now();
  let lastStatus = "status unavailable";
  const requiredLogMarkers = [
    "Phone auth dev server listening on",
  ];
  if (isEnabled(process.env.MEDIA_CRAWLER_MANAGED ?? "true")) {
    requiredLogMarkers.push("[media-crawler] API started on http://127.0.0.1:4312");
  }
  if (generationQueueEnabled()) {
    requiredLogMarkers.push(
      "[generation-outbox] Dispatcher started.",
      "[generation-maintenance] Scheduler started.",
      "[generation-video] Worker started.",
      "[canvas-agent] Worker started.",
    );
  }

  while (Date.now() - startedAt < input.timeoutMs) {
    if (!isProcessAlive(input.childPid)) {
      return { ready: false, lastStatus: "supervisor process exited during startup" };
    }
    const status = readStackStatus(input.runtime, input.statusEntrypoint);
    lastStatus = status.output;
    if (status.ready) {
      const logTail = readFileTail(input.outLog, 128 * 1024);
      const sessionOffset = logTail.lastIndexOf(`[creator-dev] ===== session ${input.sessionStartedAt} =====`);
      const currentSession = sessionOffset >= 0 ? logTail.slice(sessionOffset) : "";
      if (requiredLogMarkers.every((marker) => currentSession.includes(marker))) {
        return { ready: true, lastStatus };
      }
      lastStatus = "runtime processes exist but startup readiness markers are incomplete";
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  return { ready: false, lastStatus };
}

function isEnabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function readStackStatus(runtimePath, entrypoint) {
  const status = spawnSync(runtimePath, [entrypoint], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    timeout: 10_000,
    windowsHide: true,
  });
  return {
    ready: status.status === 0,
    output: status.stdout.trim() || status.stderr.trim() || `status_exit_${status.status ?? "unknown"}`,
  };
}

function readFileTail(path, maxBytes) {
  if (!existsSync(path)) return "";
  const size = statSync(path).size;
  const length = Math.min(size, maxBytes);
  if (length <= 0) return "";
  const fd = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(length);
    readSync(fd, buffer, 0, length, size - length);
    return buffer.toString("utf8");
  } finally {
    closeSync(fd);
  }
}

function findNodeRuntime(minMajor) {
  const candidates = [];
  const seen = new Set();

  addCandidate(process.execPath);

  const whereNode = spawnSync("where.exe", ["node"], { encoding: "utf8", windowsHide: true });
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
