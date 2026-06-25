import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const pidFile = join(process.cwd(), ".local", "run", "creator-dev-stack.pid");
const pid = readPidFile(pidFile);

if (!pid) {
  console.log("creator-dev stack is not running (no pid file).");
  process.exit(0);
}

const result = spawnSync(
  "cmd.exe",
  ["/c", "taskkill", "/PID", String(pid), "/T", "/F"],
  { encoding: "utf8" },
);

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
