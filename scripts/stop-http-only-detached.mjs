import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const pidFile = join(process.cwd(), ".local", "run", "phone-auth-http-only.pid");
const pid = readPidFile(pidFile);

if (!pid) {
  console.log("phone-auth http-only is not running (no pid file).");
  process.exit(0);
}

const result = spawnSync("cmd.exe", ["/c", "taskkill", "/PID", String(pid), "/T", "/F"], {
  encoding: "utf8",
  windowsHide: true,
});

rmSync(pidFile, { force: true });

if (result.status === 0) {
  console.log(`Stopped phone-auth http-only pid=${pid}`);
  process.exit(0);
}

const output = `${result.stdout}\n${result.stderr}`;
if (/not found|no running instance/i.test(output)) {
  console.log(`phone-auth http-only pid=${pid} was already stopped.`);
  process.exit(0);
}

console.error(output.trim());
process.exit(result.status ?? 1);

function readPidFile(path) {
  if (!existsSync(path)) return null;
  const value = readFileSync(path, "utf8").trim();
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
