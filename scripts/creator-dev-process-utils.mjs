import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

export function loadDotEnvFile(path, options = {}) {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    if (!key || (process.env[key] !== undefined && options.override !== true)) continue;
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

export function configuredPort(env = process.env) {
  const port = Number(env.PORT ?? "4310");
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("creator_dev_port_invalid");
  }
  return port;
}

export function generationQueueEnabled(env = process.env) {
  return isEnabled(env.BULLMQ_OUTBOX_DISPATCHER_ENABLED)
    || isEnabled(env.BULLMQ_WORKERS_ENABLED);
}

export function readWindowsProcess(pid) {
  if (!Number.isSafeInteger(Number(pid)) || Number(pid) < 1) return null;
  const script = `$p=Get-CimInstance Win32_Process -Filter "ProcessId = ${Number(pid)}" -ErrorAction SilentlyContinue; if($p){$p | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress}`;
  const result = runPowerShell(script);
  if (result.status !== 0 || !result.stdout.trim()) return null;
  try {
    return normalizeProcess(JSON.parse(result.stdout));
  } catch {
    return null;
  }
}

export function listWindowsChildProcesses(parentPid) {
  if (!Number.isSafeInteger(Number(parentPid)) || Number(parentPid) < 1) return [];
  const script = `@($p=Get-CimInstance Win32_Process -Filter "ParentProcessId = ${Number(parentPid)}" -ErrorAction SilentlyContinue; $p | Select-Object ProcessId,ParentProcessId,CommandLine) | ConvertTo-Json -Compress`;
  const result = runPowerShell(script);
  if (result.status !== 0 || !result.stdout.trim()) return [];
  try {
    const parsed = JSON.parse(result.stdout);
    return (Array.isArray(parsed) ? parsed : [parsed]).map(normalizeProcess).filter(Boolean);
  } catch {
    return [];
  }
}

export function isProjectProcess(processInfo, projectRoot, marker) {
  const commandLine = normalizedText(processInfo?.commandLine);
  return Boolean(
    commandLine
    && commandLine.includes(normalizedText(resolve(projectRoot)))
    && commandLine.includes(normalizedText(marker)),
  );
}

export function commandIncludes(processInfo, marker) {
  return normalizedText(processInfo?.commandLine).includes(normalizedText(marker));
}

export function findListenerPid(port) {
  const result = spawnSync("cmd.exe", ["/c", "netstat", "-ano", "-p", "tcp"], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) return null;
  const target = `:${port}`;
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line.includes(target) || !line.includes("LISTENING")) continue;
    const pid = Number(line.trim().split(/\s+/).at(-1));
    if (Number.isSafeInteger(pid) && pid > 0) return pid;
  }
  return null;
}

function normalizeProcess(value) {
  if (!value || typeof value !== "object") return null;
  const processId = Number(value.ProcessId ?? value.processId);
  const parentProcessId = Number(value.ParentProcessId ?? value.parentProcessId);
  if (!Number.isSafeInteger(processId) || processId < 1) return null;
  return {
    processId,
    parentProcessId: Number.isSafeInteger(parentProcessId) ? parentProcessId : 0,
    commandLine: String(value.CommandLine ?? value.commandLine ?? ""),
  };
}

function runPowerShell(script) {
  for (const command of ["pwsh.exe", "powershell.exe"]) {
    const result = spawnSync(command, ["-NoProfile", "-Command", script], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (!result.error || result.error.code !== "ENOENT") return result;
  }
  return { status: 1, stdout: "", stderr: "PowerShell runtime not found" };
}

function normalizedText(value) {
  return String(value ?? "").replace(/\\/g, "/").toLowerCase();
}

function isEnabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}
