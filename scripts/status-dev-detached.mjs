import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const pidFile = join(process.cwd(), ".local", "run", "creator-dev-stack.pid");
const pid = readPidFile(pidFile);
const port = Number(process.env.PORT ?? "4310");

if (!pid) {
  console.log("creator-dev stack is stopped (no pid file).");
  process.exit(1);
}

const alive = isProcessAlive(pid);
const listening = isPortListening(port);

if (alive && listening) {
  console.log(`creator-dev stack is running (pid=${pid}, port=${port})`);
  process.exit(0);
}

console.log(`creator-dev stack is unhealthy (pid=${pid}, alive=${alive}, port=${port}, listening=${listening})`);
process.exit(1);

function readPidFile(path) {
  if (!existsSync(path)) return null;
  const value = readFileSync(path, "utf8").trim();
  const pid = Number(value);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function isProcessAlive(pid) {
  const result = spawnSync(
    "cmd.exe",
    ["/c", "tasklist", "/FI", `PID eq ${pid}`],
    { encoding: "utf8" },
  );
  return result.status === 0 && result.stdout.includes(String(pid));
}

function isPortListening(port) {
  const result = spawnSync(
    "cmd.exe",
    ["/c", "netstat", "-ano", "-p", "tcp"],
    { encoding: "utf8" },
  );
  if (result.status !== 0) return false;
  const target = `:${port}`;
  return result.stdout
    .split(/\r?\n/)
    .some((line) => line.includes(target) && line.includes("LISTENING"));
}
