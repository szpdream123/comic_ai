import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const pidFile = join(process.cwd(), ".local", "run", "phone-auth-http-only.pid");
const pid = readPidFile(pidFile);
const port = Number(process.env.PORT ?? "4310");

if (!pid) {
  console.log("phone-auth http-only is stopped (no pid file).");
  process.exit(1);
}

const alive = isProcessAlive(pid);
const listening = isPortListening(port);

if (alive && listening) {
  console.log(`phone-auth http-only is running (pid=${pid}, port=${port})`);
  process.exit(0);
}

console.log(`phone-auth http-only is unhealthy (pid=${pid}, alive=${alive}, port=${port}, listening=${listening})`);
process.exit(1);

function readPidFile(path) {
  if (!existsSync(path)) return null;
  const value = readFileSync(path, "utf8").trim();
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isProcessAlive(targetPid) {
  const result = spawnSync("cmd.exe", ["/c", "tasklist", "/FI", `PID eq ${targetPid}`], {
    encoding: "utf8",
    windowsHide: true,
  });
  return result.status === 0 && result.stdout.includes(String(targetPid));
}

function isPortListening(targetPort) {
  const result = spawnSync("cmd.exe", ["/c", "netstat", "-ano", "-p", "tcp"], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) return false;
  return result.stdout
    .split(/\r?\n/)
    .some((line) => line.includes(`:${targetPort}`) && line.includes("LISTENING"));
}
