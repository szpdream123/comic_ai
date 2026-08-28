import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export function acquireRuntimeScopedProcessInstanceLock(
  runtimeIdentity,
  { label = "process", lockRoot = join(tmpdir(), "comic-ai-runtime-locks") } = {},
) {
  const normalizedIdentity = String(runtimeIdentity ?? "").trim();
  if (!normalizedIdentity) {
    throw new Error(`${label}_runtime_identity_required`);
  }
  const digest = createHash("sha256").update(normalizedIdentity).digest("hex").slice(0, 32);
  return acquireProcessInstanceLock(join(lockRoot, `${digest}.pid`), { label });
}

export function acquireProcessInstanceLock(lockPath, { label = "process" } = {}) {
  mkdirSync(dirname(lockPath), { recursive: true });

  const existingPid = readPid(lockPath);
  if (existingPid !== null && isProcessAlive(existingPid)) {
    throw new Error(`${label}_already_running:${existingPid}`);
  }
  if (existsSync(lockPath)) {
    rmSync(lockPath, { force: true });
  }

  let fileDescriptor;
  try {
    fileDescriptor = openSync(lockPath, "wx");
    writeFileSync(fileDescriptor, `${process.pid}\n`, "utf8");
  } catch (error) {
    if (fileDescriptor !== undefined) closeSync(fileDescriptor);
    throw error;
  }

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    closeSync(fileDescriptor);
    if (readPid(lockPath) === process.pid) {
      rmSync(lockPath, { force: true });
    }
  };
  process.once("exit", release);
  return release;
}

function readPid(lockPath) {
  if (!existsSync(lockPath)) return null;
  const value = Number(readFileSync(lockPath, "utf8").trim());
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function isProcessAlive(pid) {
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
