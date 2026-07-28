import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { describe, it } from "node:test";

import { createCreatorDevServiceSupervisor } from "./creator-dev-service-supervisor.mjs";

describe("creator dev service supervisor", () => {
  it("restarts only the failed generation service with bounded backoff", () => {
    const children = [];
    const timers = [];
    const delays = [];
    let now = 0;
    let fatal = "";
    const supervisor = createCreatorDevServiceSupervisor({
      now: () => now,
      spawnProcess(name) {
        const child = fakeChild(name);
        children.push(child);
        return child;
      },
      setTimeout(run, delayMs) {
        const timer = { run, delayMs, cleared: false };
        timers.push(timer);
        return timer;
      },
      clearTimeout(timer) { timer.cleared = true; },
      restartBaseMs: 100,
      restartMaxMs: 250,
      stableRunMs: 1_000,
      onRestartScheduled(_name, delayMs) { delays.push(delayMs); },
      onFatalExit(name) { fatal = name; },
    });

    supervisor.start("phone-auth", [], { restartOnFailure: false });
    supervisor.start("generation-worker", [], { restartOnFailure: true });
    children[1].emit("exit", 1, null);
    assert.equal(children[0].killed, false);
    timers[0].run();
    children[2].emit("exit", 1, null);
    timers[1].run();
    children[3].emit("exit", 1, null);

    assert.deepEqual(delays, [100, 200, 250]);
    assert.equal(fatal, "");
    assert.equal(children.filter((child) => child.name === "generation-worker").length, 3);

    now = 2_000;
    supervisor.stop();
    assert.equal(children[0].killed, true);
    assert.equal(timers[2].cleared, true);
  });

  it("resets backoff after a stable run", () => {
    const children = [];
    const timers = [];
    const delays = [];
    let now = 0;
    const supervisor = createCreatorDevServiceSupervisor({
      now: () => now,
      spawnProcess(name) {
        const child = fakeChild(name);
        children.push(child);
        return child;
      },
      setTimeout(run, delayMs) {
        const timer = { run, delayMs, cleared: false };
        timers.push(timer);
        return timer;
      },
      clearTimeout() {},
      restartBaseMs: 100,
      restartMaxMs: 1_000,
      stableRunMs: 500,
      onRestartScheduled(_name, delayMs) { delays.push(delayMs); },
      onFatalExit() {},
    });
    supervisor.start("generation-worker", [], { restartOnFailure: true });
    children[0].emit("exit", 1, null);
    timers[0].run();
    now = 1_000;
    children[1].emit("exit", 1, null);
    assert.deepEqual(delays, [100, 100]);
  });

  it("keeps a non-restartable service failure fatal", () => {
    const children = [];
    let fatal = "";
    const supervisor = createCreatorDevServiceSupervisor({
      now: () => 0,
      spawnProcess(name) {
        const child = fakeChild(name);
        children.push(child);
        return child;
      },
      setTimeout: () => ({ cleared: false }),
      clearTimeout() {},
      onFatalExit(name) { fatal = name; },
    });
    supervisor.start("phone-auth", [], { restartOnFailure: false });
    children[0].emit("exit", 1, null);
    assert.equal(fatal, "phone-auth");
  });

  it("restarts a service when the child process cannot be spawned", () => {
    const children = [];
    const timers = [];
    const spawnErrors = [];
    const supervisor = createCreatorDevServiceSupervisor({
      now: () => 0,
      spawnProcess(name) {
        const child = fakeChild(name);
        children.push(child);
        return child;
      },
      setTimeout(run, delayMs) {
        const timer = { run, delayMs, cleared: false };
        timers.push(timer);
        return timer;
      },
      clearTimeout() {},
      onSpawnError(name, error) { spawnErrors.push({ name, message: error.message }); },
      onFatalExit() {},
    });

    supervisor.start("generation-outbox", [], { restartOnFailure: true });
    children[0].emit("error", new Error("spawn_failed"));
    children[0].emit("exit", 1, null);
    timers[0].run();

    assert.deepEqual(spawnErrors, [{ name: "generation-outbox", message: "spawn_failed" }]);
    assert.equal(children.length, 2);
    assert.equal(timers.length, 1);
  });

  it("stops retrying after the configured restart limit", () => {
    const children = [];
    const timers = [];
    const limits = [];
    const supervisor = createCreatorDevServiceSupervisor({
      now: () => 0,
      spawnProcess(name) {
        const child = fakeChild(name);
        children.push(child);
        return child;
      },
      setTimeout(run, delayMs) {
        const timer = { run, delayMs };
        timers.push(timer);
        return timer;
      },
      clearTimeout() {},
      maxRestartAttempts: 2,
      onRestartLimitReached(name, attempts) { limits.push({ name, attempts }); },
    });

    supervisor.start("generation-worker", [], { restartOnFailure: true });
    children[0].emit("exit", 1, null);
    timers[0].run();
    children[1].emit("exit", 1, null);
    timers[1].run();
    children[2].emit("exit", 1, null);

    assert.deepEqual(limits, [{ name: "generation-worker", attempts: 2 }]);
    assert.equal(timers.length, 2);
    assert.equal(children.length, 3);
  });
});

function fakeChild(name) {
  const child = new EventEmitter();
  child.name = name;
  child.killed = false;
  child.kill = () => { child.killed = true; };
  return child;
}
