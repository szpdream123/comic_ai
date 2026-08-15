import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { isProjectProcess, readWindowsProcess } from "./creator-dev-process-utils.mjs";

const pidFile = join(process.cwd(), ".local", "run", "creator-dev-stack.pid");
const stopRequestFile = join(process.cwd(), ".local", "run", "creator-dev-stack.stop");
const pid = readPidFile(pidFile);

if (!pid) {
  console.log("creator-dev stack is not running (no pid file).");
  process.exit(0);
}

const processInfo = readWindowsProcess(pid);
if (!processInfo) {
  rmSync(pidFile, { force: true });
  console.log(`creator-dev stack pid=${pid} was already stopped.`);
  process.exit(0);
}
if (!isProjectProcess(processInfo, process.cwd(), "run-creator-dev-stack.mjs")) {
  rmSync(pidFile, { force: true });
  console.error(`Refusing to stop pid=${pid}: the PID file does not identify this project's creator-dev stack.`);
  process.exit(1);
}

writeFileSync(stopRequestFile, `${Date.now()}\n`, "utf8");
if (await waitForExit(pid, 12_000)) {
  rmSync(pidFile, { force: true });
  rmSync(stopRequestFile, { force: true });
  console.log(`Stopped creator-dev stack pid=${pid}`);
  process.exit(0);
}

console.warn(`creator-dev stack pid=${pid} did not stop within 12s; forcing process-tree termination.`);
const result = spawnSync("cmd.exe", ["/c", "taskkill", "/PID", String(pid), "/T", "/F"], {
  encoding: "utf8",
  windowsHide: true,
});

rmSync(pidFile, { force: true });

if (result.status === 0) {
  console.log(`Stopped creator-dev stack pid=${pid}`);
  process.exit(0);
}

if ((result.stdout + result.stderr).includes("not found")) {
  console.log(`creator-dev stack pid=${pid} was already stopped.`);
  process.exit(0);
}

console.error(result.stdout.trim());
console.error(result.stderr.trim());
process.exit(result.status ?? 1);

function readPidFile(path) {
  if (!existsSync(path)) return null;
  const value = readFileSync(path, "utf8").trim();
  const pid = Number(value);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

async function waitForExit(pid, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!readWindowsProcess(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}
