import { spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const runtime = findNodeRuntime(18);
const runDir = join(process.cwd(), ".local", "run");
const logDir = join(process.cwd(), ".local", "logs");
const pidFile = join(runDir, "creator-dev-stack.pid");
const startLockFile = join(runDir, "creator-dev-stack.start.lock");
const outLog = join(logDir, "creator-dev-stack.out.log");
const errLog = join(logDir, "creator-dev-stack.err.log");

mkdirSync(runDir, { recursive: true });
mkdirSync(logDir, { recursive: true });

const releaseStartLock = acquireStartLock(startLockFile);
process.once("exit", releaseStartLock);

const existingPid = readPidFile(pidFile);
if (existingPid && isProcessAlive(existingPid)) {
  console.log(`creator-dev stack already running (pid=${existingPid})`);
  process.exit(0);
}

if (existingPid) {
  rmSync(pidFile, { force: true });
}

const listenerPid = findListenerPid(Number(process.env.PORT ?? "4310"));
if (listenerPid) {
  terminateProcessTree(listenerPid);
  await waitForPortRelease(Number(process.env.PORT ?? "4310"), 10_000);
}

const outFd = openSync(outLog, "a");
const errFd = openSync(errLog, "a");
const child = spawnDetached(runtime, ["scripts/run-creator-dev-stack.mjs"], outFd, errFd);

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

function findListenerPid(port) {
  const result = spawnSync(
    "cmd.exe",
    ["/c", "netstat", "-ano", "-p", "tcp"],
    { encoding: "utf8" },
  );
  if (result.status !== 0) return null;

  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line.includes(`:${port}`) || !line.includes("LISTENING")) continue;
    const parts = line.trim().split(/\s+/);
    const pid = Number(parts.at(-1));
    if (Number.isInteger(pid) && pid > 0) return pid;
  }

  return null;
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
