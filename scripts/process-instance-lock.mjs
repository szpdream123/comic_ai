import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  linkSync,
  mkdirSync,
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
  const ownerToken = randomUUID();
  const recoveryPath = `${lockPath}.recovery`;

  const recoveryOwner = readLockOwner(recoveryPath);
  if (recoveryOwner || existsSync(recoveryPath)) {
    if (recoveryOwner && isProcessAlive(recoveryOwner.pid)) {
      throw new Error(`${label}_already_running:${recoveryOwner.pid}`);
    }
    throw new Error(`${label}_stale_recovery_lock:${recoveryOwner?.pid ?? "unknown"}`);
  }

  if (!createOwnedLockFile(lockPath, ownerToken)) {
    const existingOwner = readLockOwner(lockPath);
    if (existingOwner && isProcessAlive(existingOwner.pid)) {
      throw new Error(`${label}_already_running:${existingOwner.pid}`);
    }

    const recoveryToken = randomUUID();
    if (!createOwnedLockFile(recoveryPath, recoveryToken)) {
      const competingOwner = readLockOwner(recoveryPath);
      throw new Error(`${label}_already_running:${competingOwner?.pid ?? "unknown"}`);
    }
    try {
      const currentOwner = readLockOwner(lockPath);
      if (currentOwner && isProcessAlive(currentOwner.pid)) {
        throw new Error(`${label}_already_running:${currentOwner.pid}`);
      }
      rmSync(lockPath, { force: true });
      if (!createOwnedLockFile(lockPath, ownerToken)) {
        const winner = readLockOwner(lockPath);
        throw new Error(`${label}_already_running:${winner?.pid ?? "unknown"}`);
      }
    } finally {
      removeOwnedLockFile(recoveryPath, recoveryToken);
    }
  }

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    process.removeListener("exit", release);
    removeOwnedLockFile(lockPath, ownerToken);
  };
  process.once("exit", release);
  return release;
}

function createOwnedLockFile(lockPath, ownerToken) {
  const candidatePath = `${lockPath}.${process.pid}.${ownerToken}.candidate`;
  writeFileSync(candidatePath, `${process.pid}\n${ownerToken}\n`, { encoding: "utf8", flag: "wx" });
  try {
    linkSync(candidatePath, lockPath);
    return true;
  } catch (error) {
    if (error?.code === "EEXIST") return false;
    throw error;
  } finally {
    rmSync(candidatePath, { force: true });
  }
}

function removeOwnedLockFile(lockPath, ownerToken) {
  if (readLockOwner(lockPath)?.token === ownerToken) {
    rmSync(lockPath, { force: true });
  }
}

function readLockOwner(lockPath) {
  try {
    const [pidValue, token = ""] = readFileSync(lockPath, "utf8").split(/\r?\n/);
    const pid = Number(pidValue?.trim());
    return Number.isSafeInteger(pid) && pid > 0 ? { pid, token: token.trim() } : null;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
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
