export function createCreatorDevServiceSupervisor(input) {
  const services = new Map();
  const restartBaseMs = positiveInteger(input.restartBaseMs ?? 500);
  const restartMaxMs = positiveInteger(input.restartMaxMs ?? 10_000);
  const stableRunMs = positiveInteger(input.stableRunMs ?? 30_000);
  const maxRestartAttempts = positiveInteger(input.maxRestartAttempts ?? Number.MAX_SAFE_INTEGER);
  let stopping = false;

  function start(name, args, options = {}) {
    if (services.has(name)) throw new Error(`creator_dev_service_duplicate:${name}`);
    const state = {
      name,
      args,
      restartOnFailure: options.restartOnFailure === true,
      restartAttempt: 0,
      child: null,
      restartTimer: null,
      startedAt: 0,
    };
    services.set(name, state);
    spawnService(state);
  }

  function spawnService(state) {
    if (stopping) return;
    state.startedAt = input.now();
    const child = input.spawnProcess(state.name, state.args);
    state.child = child;
    input.onSpawn?.(state.name, child);
    child.once("error", (error) => {
      input.onSpawnError?.(state.name, error);
      handleExit(state, child, null, null);
    });
    child.once("exit", (code, signal) => handleExit(state, child, code, signal));
  }

  function handleExit(state, child, code, signal) {
    if (state.child !== child) return;
    state.child = null;
    if (stopping) return;

    if (!state.restartOnFailure) {
      input.onFatalExit(state.name, code, signal);
      return;
    }

    const runtimeMs = Math.max(0, input.now() - state.startedAt);
    if (runtimeMs >= stableRunMs) state.restartAttempt = 0;
    if (state.restartAttempt >= maxRestartAttempts) {
      input.onRestartLimitReached?.(state.name, state.restartAttempt, code, signal);
      return;
    }
    const delayMs = Math.min(
      restartMaxMs,
      restartBaseMs * (2 ** Math.min(state.restartAttempt, 20)),
    );
    state.restartAttempt += 1;
    input.onRestartScheduled?.(state.name, delayMs, code, signal, state.restartAttempt);
    state.restartTimer = input.setTimeout(() => {
      state.restartTimer = null;
      spawnService(state);
    }, delayMs);
  }

  return {
    start,
    stop(signal = "SIGTERM") {
      if (stopping) return;
      stopping = true;
      for (const state of services.values()) {
        if (state.restartTimer) {
          input.clearTimeout(state.restartTimer);
          state.restartTimer = null;
        }
        if (state.child && !state.child.killed) {
          if (state.child.connected && typeof state.child.send === "function") {
            state.child.send({ type: "creator-dev-stop", signal }, (error) => {
              if (error && state.child && !state.child.killed) {
                state.child.kill(signal);
              } else if (state.child?.connected) {
                state.child.disconnect();
              }
            });
          } else {
            state.child.kill(signal);
          }
        }
      }
    },
    forceStop(signal = "SIGTERM") {
      for (const state of services.values()) {
        if (state.child && !state.child.killed) state.child.kill(signal);
      }
    },
    isStopping() {
      return stopping;
    },
  };
}

function positiveInteger(value) {
  const normalized = Math.floor(Number(value));
  if (!Number.isSafeInteger(normalized) || normalized < 1) {
    throw new Error("creator_dev_restart_delay_invalid");
  }
  return normalized;
}
