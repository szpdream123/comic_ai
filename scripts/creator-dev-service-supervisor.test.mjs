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
});

function fakeChild(name) {
  const child = new EventEmitter();
  child.name = name;
  child.killed = false;
  child.kill = () => { child.killed = true; };
  return child;
}
