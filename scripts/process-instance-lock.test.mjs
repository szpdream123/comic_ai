import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import * as processInstanceLocks from "./process-instance-lock.mjs";

const { acquireProcessInstanceLock } = processInstanceLocks;

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("process instance lock", () => {
  it("rejects a second instance while the first instance is alive", () => {
    const directory = mkdtempSync(join(tmpdir(), "comic-ai-lock-"));
    temporaryDirectories.push(directory);
    const lockPath = join(directory, "instance.pid");
    const release = acquireProcessInstanceLock(lockPath, { label: "test_stack" });

    assert.equal(Number(readFileSync(lockPath, "utf8").trim()), process.pid);
    assert.throws(
      () => acquireProcessInstanceLock(lockPath, { label: "test_stack" }),
      /test_stack_already_running:/,
    );

    release();
    const releaseAfterStop = acquireProcessInstanceLock(lockPath, { label: "test_stack" });
    releaseAfterStop();
  });

  it("removes a stale PID file before acquiring the lock", () => {
    const directory = mkdtempSync(join(tmpdir(), "comic-ai-lock-"));
    temporaryDirectories.push(directory);
    const lockPath = join(directory, "instance.pid");
    writeFileSync(lockPath, "4294967295\n", "utf8");

    const release = acquireProcessInstanceLock(lockPath, { label: "test_stack" });
    assert.equal(Number(readFileSync(lockPath, "utf8").trim()), process.pid);
    release();
  });

  it("prevents two local workers from sharing the same runtime queues", () => {
    assert.equal(typeof processInstanceLocks.acquireRuntimeScopedProcessInstanceLock, "function");
    const directory = mkdtempSync(join(tmpdir(), "comic-ai-runtime-lock-"));
    temporaryDirectories.push(directory);
    const acquireRuntimeLock = processInstanceLocks.acquireRuntimeScopedProcessInstanceLock;
    const runtimeIdentity = "postgres://user:password@db.example/comic|redis://cache.example|generation";
    const release = acquireRuntimeLock(runtimeIdentity, {
      lockRoot: directory,
      label: "generation_video_worker",
    });

    assert.throws(
      () => acquireRuntimeLock(runtimeIdentity, {
        lockRoot: directory,
        label: "generation_video_worker",
      }),
      /generation_video_worker_already_running:/,
    );

    release();
  });
});
