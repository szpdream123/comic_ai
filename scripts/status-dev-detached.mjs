import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

const pidFile = join(process.cwd(), ".local", "run", "creator-dev-stack.pid");
loadDotEnvFile(join(process.cwd(), ".env"), { override: true });
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
const listening = isProjectProcess(listenerProcess, process.cwd(), "phone-auth-dev-server");
const children = alive ? listWindowsChildProcesses(pid) : [];
const expectedServices = ["run-phone-auth-dev-server.mjs"];
if (generationQueueEnabled()) {
  expectedServices.push(
    "run-generation-outbox-dispatcher.mjs",
    "run-generation-queue-maintenance.mjs",
    "run-generation-video-worker.mjs",
    "run-canvas-agent-worker.mjs",
  );
}
const missingServices = expectedServices.filter(
  (marker) => !children.some((child) => commandIncludes(child, marker)),
);

if (alive && listening && missingServices.length === 0) {
  console.log(`creator-dev stack is running (pid=${pid}, port=${port})`);
  process.exit(0);
}

console.log(`creator-dev stack is unhealthy (pid=${pid}, alive=${alive}, port=${port}, listening=${listening}, missing=${missingServices.join(",") || "none"})`);
process.exit(1);

function readPidFile(path) {
  if (!existsSync(path)) return null;
  const value = readFileSync(path, "utf8").trim();
  const pid = Number(value);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}
