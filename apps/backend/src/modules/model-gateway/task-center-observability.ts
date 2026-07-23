type TaskCenterQueryMode = "full" | "incremental";

interface TaskCenterQuerySample {
  completedAtMs: number;
  durationMs: number;
  mode: TaskCenterQueryMode;
  rowsReturned: number;
}

const sampleWindowMs = 60_000;
const maximumSamples = 4_096;
const samples: TaskCenterQuerySample[] = [];
let totalRequestCount = 0;
let incrementalRequestCount = 0;

export function recordTaskCenterQuery(input: {
  completedAt: Date;
  durationMs: number;
  mode: TaskCenterQueryMode;
  rowsReturned: number;
}) {
  totalRequestCount += 1;
  if (input.mode === "incremental") incrementalRequestCount += 1;
  samples.push({
    completedAtMs: input.completedAt.getTime(),
    durationMs: Math.max(0, input.durationMs),
    mode: input.mode,
    rowsReturned: Math.max(0, Math.floor(input.rowsReturned)),
  });
  if (samples.length > maximumSamples) {
    samples.splice(0, samples.length - maximumSamples);
  }
  pruneSamples(input.completedAt.getTime());
}

export function inspectTaskCenterRuntimeMetrics(now = new Date()) {
  pruneSamples(now.getTime());
  const durations = samples.map((sample) => sample.durationMs).sort((left, right) => left - right);
  return {
    windowSeconds: sampleWindowMs / 1_000,
    requestCount: samples.length,
    requestsPerSecond: samples.length / (sampleWindowMs / 1_000),
    p95Ms: percentile(durations, 0.95),
    p99Ms: percentile(durations, 0.99),
    rowsReturned: samples.reduce((total, sample) => total + sample.rowsReturned, 0),
    incrementalRequestCount: samples.filter((sample) => sample.mode === "incremental").length,
    totalRequestCount,
    totalIncrementalRequestCount: incrementalRequestCount,
    coordinationWriteCount: 0,
  };
}

export function resetTaskCenterRuntimeMetricsForTests() {
  samples.splice(0, samples.length);
  totalRequestCount = 0;
  incrementalRequestCount = 0;
}

function pruneSamples(nowMs: number) {
  const cutoff = nowMs - sampleWindowMs;
  let removeCount = 0;
  while (removeCount < samples.length && samples[removeCount]!.completedAtMs < cutoff) {
    removeCount += 1;
  }
  if (removeCount > 0) samples.splice(0, removeCount);
}

function percentile(values: number[], ratio: number) {
  if (!values.length) return null;
  return values[Math.max(0, Math.ceil(values.length * ratio) - 1)] ?? null;
}
