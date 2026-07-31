/**
 * Bounded dynamic worker lifecycle for elastic generation queues.
 *
 * The runner deliberately knows nothing about BullMQ or the database.  The
 * caller supplies a shard directory reader and a Worker factory, which keeps
 * discovery testable and prevents one process from opening an unbounded
 * number of Redis consumers as shards are added.
 */

export interface GenerationShardWorkerSpec {
  queueName: string;
  mediaType: "image" | "video" | "audio";
  stage: "submit" | "poll" | "fetch" | "persist";
  routeCode: string;
  shardNo: number;
  admittedCount?: number;
  oldestAdmittedAtMs?: number | null;
  runnableCount?: number;
  rateLimitMax?: number;
  rateLimitDurationMs?: number;
}

export interface GenerationShardWorkerHandle {
  close(): Promise<void>;
}

export interface GenerationShardWorkerRunner {
  start(): Promise<void>;
  refresh(): Promise<void>;
  close(): Promise<void>;
  activeQueueNames(): string[];
}

export interface GenerationShardWorkerRunnerDeps {
  discover(): Promise<GenerationShardWorkerSpec[]>;
  createWorker(
    spec: GenerationShardWorkerSpec & {
      rateLimitMax: number;
      rateLimitDurationMs: number;
    },
  ): GenerationShardWorkerHandle;
  maxQueuesPerProcess: number;
  processIndex?: number;
  processCount?: number;
  refreshIntervalMs?: number;
  defaultRateLimitMax?: number;
  defaultRateLimitDurationMs?: number;
  setInterval?: typeof setInterval;
  clearInterval?: typeof clearInterval;
  closeWorkersOnDiscoveryFailure?: boolean;
  onRefreshError?(error: unknown): void;
}

/**
 * Creates a runner that owns at most maxQueuesPerProcess queue consumers.
 * Active shards are balanced across the total worker capacity first; idle
 * shards use stable hashing so directory churn does not reshuffle every worker.
 */
export function createGenerationShardWorkerRunner(
  deps: GenerationShardWorkerRunnerDeps,
): GenerationShardWorkerRunner {
  const maxQueuesPerProcess = positiveInteger(deps.maxQueuesPerProcess, "generation_worker_queue_limit_invalid");
  const processCount = positiveInteger(deps.processCount ?? 1, "generation_worker_process_count_invalid");
  const processIndex = nonNegativeInteger(deps.processIndex ?? 0, "generation_worker_process_index_invalid");
  if (processIndex >= processCount) {
    throw new Error("generation_worker_process_index_invalid");
  }

  const refreshIntervalMs = Math.max(0, Math.floor(deps.refreshIntervalMs ?? 5_000));
  const defaultRateLimitMax = positiveInteger(deps.defaultRateLimitMax ?? 5, "generation_worker_rate_limit_invalid");
  const defaultRateLimitDurationMs = positiveInteger(
    deps.defaultRateLimitDurationMs ?? 1_000,
    "generation_worker_rate_limit_invalid",
  );
  const timers = {
    setInterval: deps.setInterval ?? setInterval,
    clearInterval: deps.clearInterval ?? clearInterval,
  };
  const workers = new Map<string, GenerationShardWorkerHandle>();
  const closingWorkers = new Set<Promise<void>>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let refreshInFlight: Promise<void> | undefined;
  let closed = false;

  async function refresh() {
    if (closed) return;
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = refreshInternal().finally(() => {
      refreshInFlight = undefined;
    });
    return refreshInFlight;
  }

  async function refreshInternal() {
    let discovered: GenerationShardWorkerSpec[];
    try {
      discovered = await deps.discover();
    } catch (error) {
      if (deps.closeWorkersOnDiscoveryFailure === true) {
        closeActiveWorkers();
      }
      throw error;
    }
    if (closed) return;
    const selected = selectOwnedShards(discovered, {
      maxQueuesPerProcess,
      processIndex,
      processCount,
    });
    const wanted = new Map(selected.map((spec) => [spec.queueName, spec]));

    for (const [queueName, worker] of workers) {
      if (wanted.has(queueName)) continue;
      workers.delete(queueName);
      trackClosingWorker(worker);
    }
    for (const spec of selected) {
      if (closed) return;
      if (workers.has(spec.queueName)) continue;
      workers.set(spec.queueName, deps.createWorker({
        ...spec,
        rateLimitMax: positiveInteger(spec.rateLimitMax ?? defaultRateLimitMax, "generation_worker_rate_limit_invalid"),
        rateLimitDurationMs: positiveInteger(
          spec.rateLimitDurationMs ?? defaultRateLimitDurationMs,
          "generation_worker_rate_limit_invalid",
        ),
      }));
    }
  }

  function trackClosingWorker(worker: GenerationShardWorkerHandle) {
    let closeResult: Promise<void>;
    try {
      closeResult = worker.close();
    } catch {
      return;
    }
    const closing = Promise.resolve(closeResult)
      .catch(() => undefined)
      .finally(() => closingWorkers.delete(closing));
    closingWorkers.add(closing);
  }

  function closeActiveWorkers() {
    for (const worker of workers.values()) trackClosingWorker(worker);
    workers.clear();
  }

  return {
    async start() {
      if (closed) throw new Error("generation_worker_runner_closed");
      await refresh();
      if (!closed && refreshIntervalMs > 0 && !timer) {
        timer = timers.setInterval(() => {
          void refresh().catch((error) => deps.onRefreshError?.(error));
        }, refreshIntervalMs);
      }
    },
    refresh,
    async close() {
      if (closed) return;
      closed = true;
      if (timer) {
        timers.clearInterval(timer);
        timer = undefined;
      }
      const activeWorkers = [...workers.values()];
      workers.clear();
      await Promise.allSettled([
        ...activeWorkers.map((worker) => worker.close()),
        ...closingWorkers,
      ]);
    },
    activeQueueNames() {
      return [...workers.keys()].sort();
    },
  };
}

export function selectOwnedShards(
  specs: GenerationShardWorkerSpec[],
  input: { maxQueuesPerProcess: number; processIndex: number; processCount: number },
) {
  const all = prioritizeGenerationShards(specs);
  const activeCapacity = input.maxQueuesPerProcess * input.processCount;
  const active = all
    .filter((spec) => normalizedAdmittedCount(spec.admittedCount) > 0)
    .slice(0, activeCapacity);
  const ownedActive = active.filter(
    (_, index) => index % input.processCount === input.processIndex,
  );
  const remainingCapacity = input.maxQueuesPerProcess - ownedActive.length;
  if (remainingCapacity <= 0) return ownedActive;
  const ownedIdle = all
    .filter((spec) => normalizedAdmittedCount(spec.admittedCount) === 0)
    .filter((spec) => stableQueueOwner(spec.queueName, input.processCount) === input.processIndex)
    .slice(0, remainingCapacity);
  return [...ownedActive, ...ownedIdle];
}

export function prioritizeGenerationShards(specs: GenerationShardWorkerSpec[]) {
  const unique = new Map<string, GenerationShardWorkerSpec>();
  for (const spec of specs) {
    if (!spec || typeof spec.queueName !== "string" || !spec.queueName.trim()) continue;
    unique.set(spec.queueName, spec);
  }
  return [...unique.values()].sort(compareShardPriority);
}

function compareShardPriority(
  left: GenerationShardWorkerSpec,
  right: GenerationShardWorkerSpec,
) {
  const leftCount = normalizedAdmittedCount(left.admittedCount);
  const rightCount = normalizedAdmittedCount(right.admittedCount);
  const leftRunnable = normalizedAdmittedCount(left.runnableCount);
  const rightRunnable = normalizedAdmittedCount(right.runnableCount);
  const leftHasRunnableWork = leftRunnable > 0;
  const rightHasRunnableWork = rightRunnable > 0;
  if (leftHasRunnableWork !== rightHasRunnableWork) return leftHasRunnableWork ? -1 : 1;
  if (leftHasRunnableWork && leftRunnable !== rightRunnable) return rightRunnable - leftRunnable;
  const leftHasWork = leftCount > 0;
  const rightHasWork = rightCount > 0;
  if (leftHasWork !== rightHasWork) return leftHasWork ? -1 : 1;
  if (leftHasWork) {
    const leftOldest = normalizedOldestAdmittedAt(left.oldestAdmittedAtMs);
    const rightOldest = normalizedOldestAdmittedAt(right.oldestAdmittedAtMs);
    if (leftOldest !== rightOldest) return leftOldest - rightOldest;
    if (leftCount !== rightCount) return rightCount - leftCount;
  }
  return left.queueName.localeCompare(right.queueName);
}

function normalizedAdmittedCount(value: number | undefined) {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : 0;
}

function normalizedOldestAdmittedAt(value: number | null | undefined) {
  return Number.isFinite(value) && Number(value) >= 0 ? Number(value) : Number.MAX_SAFE_INTEGER;
}

function stableQueueOwner(queueName: string, processCount: number) {
  let hash = 2166136261;
  for (let index = 0; index < queueName.length; index += 1) {
    hash ^= queueName.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % processCount;
}

function positiveInteger(value: number, errorCode: string) {
  const normalized = Math.floor(Number(value));
  if (!Number.isSafeInteger(normalized) || normalized < 1) throw new Error(errorCode);
  return normalized;
}

function nonNegativeInteger(value: number, errorCode: string) {
  const normalized = Math.floor(Number(value));
  if (!Number.isSafeInteger(normalized) || normalized < 0) throw new Error(errorCode);
  return normalized;
}
