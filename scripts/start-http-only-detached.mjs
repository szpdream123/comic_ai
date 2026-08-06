import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const runtime = findNodeRuntime(18);
const port = Number(process.env.PORT ?? "4310");
const runDir = join(process.cwd(), ".local", "run");
const logDir = join(process.cwd(), ".local", "logs");
const pidFile = join(runDir, "phone-auth-http-only.pid");
const outLog = join(logDir, "phone-auth-http-only.out.log");
const errLog = join(logDir, "phone-auth-http-only.err.log");

mkdirSync(runDir, { recursive: true });
mkdirSync(logDir, { recursive: true });

const existingPid = readPidFile(pidFile);
if (existingPid && isProcessAlive(existingPid)) {
  console.log(`phone-auth http-only already running (pid=${existingPid})`);
  process.exit(0);
}

if (existingPid) {
  rmSync(pidFile, { force: true });
}

const listenerPid = findListenerPid(port);
if (listenerPid) {
  terminateProcessTree(listenerPid);
  waitForPortRelease(port, 10_000);
}

const child = process.platform === "win32"
  ? startHiddenWindowsNode(runtime)
  : spawn(runtime, ["scripts/run-phone-auth-http-only.mjs"], {
    cwd: process.cwd(),
    env: process.env,
    detached: true,
    stdio: ["ignore", openSync(outLog, "a"), openSync(errLog, "a")],
  });

child.unref();
writeFileSync(pidFile, `${child.pid}\n`, "utf8");
console.log(`Detached phone-auth http-only pid=${child.pid}`);
console.log(`Logs: ${outLog}`);

function startHiddenWindowsNode(filePath) {
  const wscript = join(process.env.SystemRoot || "C:\\Windows", "System32", "wscript.exe");
  const launcher = spawnSync(wscript, [
    join(process.cwd(), "scripts", "launch-hidden-node.vbs"),
    filePath,
    "scripts/run-phone-auth-http-only.mjs",
    process.cwd(),
  ], {
    cwd: process.cwd(),
    env: process.env,
    windowsHide: true,
    stdio: "ignore",
  });
  if (launcher.status !== 0) throw new Error("Unable to launch hidden phone-auth process");
  const startedAt = Date.now();
  while (Date.now() - startedAt < 35_000) {
    const pid = findListenerPid(port);
    if (pid) return { pid, unref() {} };
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error("Unable to detect hidden phone-auth process listener");
}



function readPidFile(path) {
  if (!existsSync(path)) return null;
  const value = readFileSync(path, "utf8").trim();
  const pid = Number(value);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function isProcessAlive(pid) {
  const result = spawnSync("cmd.exe", ["/c", "tasklist", "/FI", `PID eq ${pid}`], {
    encoding: "utf8",
  });
  return result.status === 0 && result.stdout.includes(String(pid));
}

function findListenerPid(targetPort) {
  const result = spawnSync("cmd.exe", ["/c", "netstat", "-ano", "-p", "tcp"], {
    encoding: "utf8",
  });
  if (result.status !== 0) return null;
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line.includes(`:${targetPort}`) || !line.includes("LISTENING")) continue;
    const parts = line.trim().split(/\s+/);
    const pid = Number(parts.at(-1));
    if (Number.isInteger(pid) && pid > 0) return pid;
  }
  return null;
}

function terminateProcessTree(pid) {
  const result = spawnSync("cmd.exe", ["/c", "taskkill", "/PID", String(pid), "/T", "/F"], {
    encoding: "utf8",
  });
  if (result.status === 0) {
    console.log(`Stopped existing listener pid=${pid}`);
    return;
  }
  const message = `${result.stdout}\n${result.stderr}`.trim();
  if (message) {
    console.warn(message);
  }
}

function waitForPortRelease(targetPort, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!findListenerPid(targetPort)) return;
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
