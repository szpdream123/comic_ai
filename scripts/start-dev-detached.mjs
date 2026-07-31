import { spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, writeSync } from "node:fs";
import { join } from "node:path";

import {
  configuredPort,
  findListenerPid,
  isProjectProcess,
  loadDotEnvFile,
  readWindowsProcess,
} from "./creator-dev-process-utils.mjs";

const runtime = findNodeRuntime(18);
const runDir = join(process.cwd(), ".local", "run");
const logDir = join(process.cwd(), ".local", "logs");
const pidFile = join(runDir, "creator-dev-stack.pid");
const startLockFile = join(runDir, "creator-dev-stack.start.lock");
const outLog = join(logDir, "creator-dev-stack.out.log");
const errLog = join(logDir, "creator-dev-stack.err.log");
const projectRoot = process.cwd();
const stackEntrypoint = join(projectRoot, "scripts", "run-creator-dev-stack.mjs");
const stopRequestFile = join(runDir, "creator-dev-stack.stop");

loadDotEnvFile(join(projectRoot, ".env"), { override: true });
const port = configuredPort();

mkdirSync(runDir, { recursive: true });
mkdirSync(logDir, { recursive: true });

const releaseStartLock = acquireStartLock(startLockFile);
process.once("exit", releaseStartLock);

const existingPid = readPidFile(pidFile);
const existingProcess = existingPid ? readWindowsProcess(existingPid) : null;
if (existingProcess && isProjectProcess(existingProcess, projectRoot, "run-creator-dev-stack.mjs")) {
  console.log(`creator-dev stack already running (pid=${existingPid})`);
  process.exit(0);
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
releaseStartLock();
console.log(`Detached creator-dev stack pid=${child.pid}`);
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
    { encoding: "utf8" },
  );
  return result.status === 0 && result.stdout.includes(String(pid));
}

function terminateProcessTree(pid) {
  const result = spawnSync(
    "cmd.exe",
    ["/c", "taskkill", "/PID", String(pid), "/T", "/F"],
    { encoding: "utf8" },
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

function findNodeRuntime(minMajor) {
  const candidates = [];
  const seen = new Set();

  addCandidate(process.execPath);

  const whereNode = spawnSync("where.exe", ["node"], { encoding: "utf8" });
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
