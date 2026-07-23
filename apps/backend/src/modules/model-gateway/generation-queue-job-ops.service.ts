import { Queue, type JobsOptions } from "bullmq";

import type { GenerationQueueConfig } from "./generation-queue.config.ts";

export type GenerationQueueJobAction = "retry" | "promote" | "remove" | "replay";

type GenerationQueueJobOpsError =
  | "generation_queue_not_allowed"
  | "generation_queue_job_action_invalid"
  | "generation_queue_job_not_found"
  | "generation_queue_job_state_mismatch"
  | "generation_queue_job_replay_not_ready"
  | "generation_queue_job_action_unsupported";

export interface GenerationQueueReplayValidationInput {
  sourceQueueName: string;
  sourceJobName: string;
  sourceJobId: string;
  sourceJobData: Record<string, unknown>;
}

export type GenerationQueueReplayValidator = (
  input: GenerationQueueReplayValidationInput,
) => Promise<boolean>;

export interface GenerationQueueJobRerouteInput extends GenerationQueueReplayValidationInput {
  action: "retry" | "replay";
  targetJobId: string;
}

export interface GenerationQueueJobRerouteResult {
  queueName: string;
  queueAssignmentKey: string;
}

export interface GenerationQueueJobShardOps {
  reroute(input: GenerationQueueJobRerouteInput): Promise<GenerationQueueJobRerouteResult | null>;
  markPublished(assignmentKey: string, redisJobId: string): Promise<void>;
  release(assignmentKey: string, reason: string): Promise<void>;
}

export interface GenerationQueueJobOperationCheckpoint {
  source?: {
    queueName: string;
    jobId: string;
    jobName: string;
    state: string;
    attemptsMade: number;
    failedReason: string | null;
    data: Record<string, unknown>;
    options: Record<string, unknown>;
  };
  target?: {
    queueName: string;
    jobId: string;
    assignmentKey?: string;
  };
  targetAdded?: boolean;
  sourceRemoved?: boolean;
  sourceAssignmentReleased?: boolean;
  actionApplied?: boolean;
}

export interface GenerationQueueJobOperationJournal {
  load(): Promise<GenerationQueueJobOperationCheckpoint>;
  save(checkpoint: GenerationQueueJobOperationCheckpoint): Promise<void>;
}

interface GenerationQueueJobOpsResult {
  queueName: string;
  jobId: string;
  jobName: string;
  action: GenerationQueueJobAction;
  previousState: string;
  attemptsMade: number;
  failedReason: string | null;
  replayedQueueName?: string;
  replayedJobId?: string;
}

interface GenerationQueueJobOpsClient {
  id?: string | number | null;
  name?: string;
  failedReason?: string | null;
  attemptsMade?: number;
  data?: Record<string, unknown>;
  opts?: JobsOptions;
  getState(): Promise<string>;
  retry?(state?: "failed" | "completed"): Promise<void>;
  promote?(): Promise<void>;
  remove?(): Promise<void>;
}

interface GenerationQueueOpsClient {
  name: string;
  getJob(jobId: string): Promise<GenerationQueueJobOpsClient | null>;
  add?(name: string, data: Record<string, unknown>, options: JobsOptions): Promise<{ id?: string | number | null }>;
  close(): Promise<void>;
}

interface GenerationQueueJobOpsServiceDeps {
  config: GenerationQueueConfig;
  queueFactory(queueName: string): GenerationQueueOpsClient;
  validateReplay?: GenerationQueueReplayValidator;
  /** Optional shard-directory reader used to authorize dynamically-created queues. */
  queueDiscovery?: () => Promise<string[]>;
  shardOps?: GenerationQueueJobShardOps;
}

export type GenerationQueueJobOpsService = ReturnType<typeof createGenerationQueueJobOpsService>;

export function createGenerationQueueJobOpsService(
  deps: GenerationQueueJobOpsServiceDeps,
) {
  const configuredAllowedQueues = new Set(configuredQueueNames(deps.config));

  return {
    async operate(input: {
      queueName: string;
      jobId: string;
      action: GenerationQueueJobAction;
      journal?: GenerationQueueJobOperationJournal;
    }): Promise<
      | { status: 200; body: GenerationQueueJobOpsResult }
      | {
          status: 400 | 404 | 409;
          body:
            | { error: Exclude<GenerationQueueJobOpsError, "generation_queue_job_state_mismatch"> }
            | { error: "generation_queue_job_state_mismatch"; state: string };
        }
    > {
      const queueName = input.queueName.trim();
      const jobId = input.jobId.trim();
      if (!isGenerationQueueJobAction(input.action)) {
        return { status: 400, body: { error: "generation_queue_job_action_invalid" } };
      }
      const allowedQueues = await resolveAllowedQueues(deps, configuredAllowedQueues);
      if (!allowedQueues.has(queueName)) {
        return { status: 400, body: { error: "generation_queue_not_allowed" } };
      }

      let checkpoint = input.journal ? await input.journal.load() : {};
      const saveCheckpoint = async (next: GenerationQueueJobOperationCheckpoint) => {
        checkpoint = next;
        await input.journal?.save(next);
      };
      const queue = deps.queueFactory(queueName);
      try {
        let job = await queue.getJob(jobId);
        if (!job && !checkpoint.source) {
          return { status: 404, body: { error: "generation_queue_job_not_found" } };
        }

        let state = checkpoint.source?.state ?? "unknown";
        let currentState: string | null = null;
        if (job) {
          currentState = await job.getState();
          if (!checkpoint.source) state = currentState;
          const stateError = validateActionState(
            input.action,
            currentState,
            queueName === deps.config.queues.deadLetter,
          );
          if (stateError && !checkpoint.source) {
            return {
              status: 409,
              body: {
                error: "generation_queue_job_state_mismatch",
                state: currentState,
              },
            };
          }
          if (!checkpoint.source) {
            await saveCheckpoint({
              ...checkpoint,
              source: snapshotSourceJob(queueName, jobId, currentState, job),
            });
          }
        } else {
          job = sourceJobFromCheckpoint(checkpoint.source!);
        }

        if (input.action === "replay") {
          const replay = await replayDeadLetterJob({
            deadLetterJob: job,
            deadLetterJobId: jobId,
            deadLetterQueueName: deps.config.queues.deadLetter,
            allowedQueues,
            replayValidationQueues: new Set([
              deps.config.queues.submitImage,
              deps.config.queues.submitVideo,
              deps.config.queues.pollImage,
              deps.config.queues.pollVideo,
              deps.config.queues.pollAudio,
            ]),
            isReplayValidationQueue: (name) => isDynamicGenerationWorkQueue(name),
            queueFactory: deps.queueFactory,
            validateReplay: deps.validateReplay,
            shardOps: deps.shardOps,
            checkpoint,
            saveCheckpoint,
          });
          if (!replay.ok) {
            return { status: 409, body: { error: replay.error } };
          }
          return {
            status: 200,
            body: {
              queueName,
              jobId,
              jobName: job.name ?? "",
              action: input.action,
              previousState: state,
              attemptsMade: numberOrZero(job.attemptsMade),
              failedReason: job.failedReason ?? null,
              replayedQueueName: replay.queueName,
              replayedJobId: replay.jobId,
            },
          };
        } else if (input.action === "retry") {
          if (isDynamicGenerationWorkQueue(queueName) && deps.shardOps) {
            const retried = await rerouteFailedJob({
              sourceJob: job,
              sourceJobId: jobId,
              sourceQueueName: queueName,
              queueFactory: deps.queueFactory,
              shardOps: deps.shardOps,
              checkpoint,
              saveCheckpoint,
            });
            if (!retried) {
              return { status: 409, body: { error: "generation_queue_job_action_unsupported" } };
            }
          } else {
            if (!checkpoint.actionApplied && checkpoint.source && currentState !== "failed") {
              await saveCheckpoint({ ...checkpoint, actionApplied: true });
            }
            if (!checkpoint.actionApplied) {
              if (typeof job.retry !== "function") {
                return { status: 409, body: { error: "generation_queue_job_action_unsupported" } };
              }
              await job.retry("failed");
              await saveCheckpoint({ ...checkpoint, actionApplied: true });
            }
          }
        } else if (input.action === "promote") {
          if (!checkpoint.actionApplied && checkpoint.source && currentState !== "delayed") {
            await saveCheckpoint({ ...checkpoint, actionApplied: true });
          }
          if (!checkpoint.actionApplied) {
            if (typeof job.promote !== "function") {
              return { status: 409, body: { error: "generation_queue_job_action_unsupported" } };
            }
            await job.promote();
            await saveCheckpoint({ ...checkpoint, actionApplied: true });
          }
        } else {
          if (typeof job.remove !== "function") {
            return { status: 409, body: { error: "generation_queue_job_action_unsupported" } };
          }
          if (!checkpoint.sourceRemoved) {
            await job.remove();
            await saveCheckpoint({ ...checkpoint, sourceRemoved: true });
          }
          if (!checkpoint.sourceAssignmentReleased) {
            await releaseJobAssignment(job, deps.shardOps, "admin_removed");
            await saveCheckpoint({ ...checkpoint, sourceAssignmentReleased: true });
          }
        }

        return {
          status: 200,
          body: {
            queueName,
            jobId,
            jobName: job.name ?? "",
            action: input.action,
            previousState: state,
            attemptsMade: numberOrZero(job.attemptsMade),
            failedReason: job.failedReason ?? null,
          },
        };
      } finally {
        await queue.close();
      }
    },
  };
}

function isGenerationQueueJobAction(action: unknown): action is GenerationQueueJobAction {
  return action === "retry" || action === "promote" || action === "remove" || action === "replay";
}

export function createBullMQGenerationQueueJobOpsService(
  config: GenerationQueueConfig,
  validateReplay?: GenerationQueueReplayValidator,
  queueDiscovery?: () => Promise<string[]>,
  shardOps?: GenerationQueueJobShardOps,
) {
  return createGenerationQueueJobOpsService({
    config,
    validateReplay,
    queueDiscovery,
    shardOps,
    queueFactory: (queueName) =>
      new Queue(queueName, {
        connection: redisConnectionFromUrl(config.redisUrl),
        prefix: config.queuePrefix,
      }) as unknown as GenerationQueueOpsClient,
  });
}

async function resolveAllowedQueues(
  deps: GenerationQueueJobOpsServiceDeps,
  configured: Set<string>,
) {
  if (!deps.queueDiscovery) return configured;
  try {
    const discovered = await deps.queueDiscovery();
    const allowed = new Set(configured);
    for (const queueName of discovered) {
      if (typeof queueName === "string" && queueName.trim()) allowed.add(queueName.trim());
    }
    return allowed;
  } catch {
    return configured;
  }
}

function validateActionState(action: GenerationQueueJobAction, state: string, isDeadLetter: boolean) {
  if (action === "replay") {
    return isDeadLetter && ["waiting", "delayed", "failed"].includes(state)
      ? null
      : "generation_queue_job_state_mismatch";
  }
  if (action === "retry") {
    return state === "failed" ? null : "generation_queue_job_state_mismatch";
  }
  if (action === "promote") {
    return state === "delayed" ? null : "generation_queue_job_state_mismatch";
  }
  return state === "active" ? "generation_queue_job_state_mismatch" : null;
}

async function replayDeadLetterJob(input: {
  deadLetterJob: GenerationQueueJobOpsClient;
  deadLetterJobId: string;
  deadLetterQueueName: string;
  allowedQueues: Set<string>;
  replayValidationQueues: Set<string>;
  isReplayValidationQueue?: (queueName: string) => boolean;
  queueFactory(queueName: string): GenerationQueueOpsClient;
  validateReplay?: GenerationQueueReplayValidator;
  shardOps?: GenerationQueueJobShardOps;
  checkpoint: GenerationQueueJobOperationCheckpoint;
  saveCheckpoint(checkpoint: GenerationQueueJobOperationCheckpoint): Promise<void>;
}): Promise<
  | { ok: true; queueName: string; jobId: string }
  | {
      ok: false;
      error:
        | "generation_queue_job_action_unsupported"
        | "generation_queue_job_replay_not_ready";
    }
> {
  const data = input.deadLetterJob.data ?? {};
  const sourceQueueName = readString(data.sourceQueueName);
  const sourceJobName = readString(data.sourceJobName);
  const sourceJobId = readString(data.sourceJobId);
  const sourceJobData = readRecord(data.sourceJobData);
  if (
    !sourceQueueName
    || !sourceJobName
    || !sourceJobId
    || !sourceJobData
    || (!input.allowedQueues.has(sourceQueueName)
      && !(input.shardOps && input.isReplayValidationQueue?.(sourceQueueName)))
    || sourceQueueName === input.deadLetterQueueName
  ) {
    return { ok: false, error: "generation_queue_job_action_unsupported" };
  }

  if (!input.checkpoint.target
    && (input.replayValidationQueues.has(sourceQueueName) || input.isReplayValidationQueue?.(sourceQueueName))) {
    const replayAllowed = input.validateReplay
      ? await input.validateReplay({
          sourceQueueName,
          sourceJobName,
          sourceJobId,
          sourceJobData,
        })
      : false;
    if (!replayAllowed) {
      return { ok: false, error: "generation_queue_job_replay_not_ready" };
    }
  }

  const replayJobId = `${sourceJobId}__dlq_replay__${replayToken(data.failedAt, input.deadLetterJobId)}`;
  let checkpoint = input.checkpoint;
  const rerouted = checkpoint.target?.assignmentKey
    ? {
        queueName: checkpoint.target.queueName,
        queueAssignmentKey: checkpoint.target.assignmentKey,
      }
    : input.shardOps && input.isReplayValidationQueue?.(sourceQueueName)
      ? await input.shardOps.reroute({
          action: "replay",
          sourceQueueName,
          sourceJobName,
          sourceJobId,
          sourceJobData,
          targetJobId: replayJobId,
        })
      : null;
  if (input.shardOps && input.isReplayValidationQueue?.(sourceQueueName) && !rerouted) {
    return { ok: false, error: "generation_queue_job_action_unsupported" };
  }
  const targetQueueName = rerouted?.queueName ?? sourceQueueName;
  const targetJobData = rerouted
    ? { ...sourceJobData, queueAssignmentKey: rerouted.queueAssignmentKey }
    : sourceJobData;
  const targetQueue = input.queueFactory(targetQueueName);
  try {
    if (typeof targetQueue.add !== "function" || typeof input.deadLetterJob.remove !== "function") {
      if (rerouted) {
        await input.shardOps?.release(rerouted.queueAssignmentKey, "admin_replay_unsupported");
      }
      return { ok: false, error: "generation_queue_job_action_unsupported" };
    }
    if (!checkpoint.target) {
      checkpoint = {
        ...checkpoint,
        target: {
          queueName: targetQueueName,
          jobId: replayJobId,
          ...(rerouted ? { assignmentKey: rerouted.queueAssignmentKey } : {}),
        },
      };
      await input.saveCheckpoint(checkpoint);
    }
    let added: { id?: string | number | null } = { id: replayJobId };
    try {
      if (!checkpoint.targetAdded) {
        added = await targetQueue.add(
          sourceJobName,
          targetJobData,
          {
            ...readReplayOptions(data.sourceJobOptions),
            jobId: replayJobId,
          },
        );
        if (rerouted) {
          await input.shardOps?.markPublished(rerouted.queueAssignmentKey, replayJobId);
        }
        checkpoint = { ...checkpoint, targetAdded: true };
        await input.saveCheckpoint(checkpoint);
      }
    } catch (error) {
      throw error;
    }
    if (!checkpoint.sourceRemoved) {
      await input.deadLetterJob.remove();
      checkpoint = { ...checkpoint, sourceRemoved: true };
      await input.saveCheckpoint(checkpoint);
    }
    return {
      ok: true,
      queueName: targetQueueName,
      jobId: String(added.id ?? replayJobId),
    };
  } finally {
    await targetQueue.close();
  }
}

async function rerouteFailedJob(input: {
  sourceJob: GenerationQueueJobOpsClient;
  sourceJobId: string;
  sourceQueueName: string;
  queueFactory(queueName: string): GenerationQueueOpsClient;
  shardOps: GenerationQueueJobShardOps;
  checkpoint: GenerationQueueJobOperationCheckpoint;
  saveCheckpoint(checkpoint: GenerationQueueJobOperationCheckpoint): Promise<void>;
}) {
  const sourceJobName = input.sourceJob.name ?? "";
  const sourceJobData = input.sourceJob.data ?? {};
  if (!sourceJobName || !readString(sourceJobData.taskId) || typeof input.sourceJob.remove !== "function") {
    return false;
  }
  const targetJobId = `${input.sourceJobId}__admin_retry__${input.sourceJob.attemptsMade ?? 0}`;
  let checkpoint = input.checkpoint;
  const rerouted = checkpoint.target?.assignmentKey
    ? {
        queueName: checkpoint.target.queueName,
        queueAssignmentKey: checkpoint.target.assignmentKey,
      }
    : await input.shardOps.reroute({
        action: "retry",
        sourceQueueName: input.sourceQueueName,
        sourceJobName,
        sourceJobId: input.sourceJobId,
        sourceJobData,
        targetJobId,
      });
  if (!rerouted) return false;

  if (!checkpoint.target) {
    checkpoint = {
      ...checkpoint,
      target: {
        queueName: rerouted.queueName,
        jobId: targetJobId,
        assignmentKey: rerouted.queueAssignmentKey,
      },
    };
    await input.saveCheckpoint(checkpoint);
  }

  const targetQueue = input.queueFactory(rerouted.queueName);
  try {
    if (typeof targetQueue.add !== "function") {
      await input.shardOps.release(rerouted.queueAssignmentKey, "admin_retry_unsupported");
      return false;
    }
    try {
      if (!checkpoint.targetAdded) {
        await targetQueue.add(
          sourceJobName,
          { ...sourceJobData, queueAssignmentKey: rerouted.queueAssignmentKey },
          { ...readReplayOptions(input.sourceJob.opts), jobId: targetJobId },
        );
        await input.shardOps.markPublished(rerouted.queueAssignmentKey, targetJobId);
        checkpoint = { ...checkpoint, targetAdded: true };
        await input.saveCheckpoint(checkpoint);
      }
    } catch (error) {
      throw error;
    }
    if (!checkpoint.sourceRemoved) {
      await input.sourceJob.remove();
      checkpoint = { ...checkpoint, sourceRemoved: true };
      await input.saveCheckpoint(checkpoint);
    }
    if (!checkpoint.sourceAssignmentReleased) {
      await releaseJobAssignment(input.sourceJob, input.shardOps, "admin_retried");
      checkpoint = { ...checkpoint, sourceAssignmentReleased: true };
      await input.saveCheckpoint(checkpoint);
    }
    return true;
  } finally {
    await targetQueue.close();
  }
}

async function releaseJobAssignment(
  job: GenerationQueueJobOpsClient,
  shardOps: GenerationQueueJobShardOps | undefined,
  reason: string,
) {
  const assignmentKey = readString(job.data?.queueAssignmentKey);
  if (assignmentKey && shardOps) {
    await shardOps.release(assignmentKey, reason);
  }
}

function snapshotSourceJob(
  queueName: string,
  jobId: string,
  state: string,
  job: GenerationQueueJobOpsClient,
): NonNullable<GenerationQueueJobOperationCheckpoint["source"]> {
  return {
    queueName,
    jobId,
    jobName: job.name ?? "",
    state,
    attemptsMade: numberOrZero(job.attemptsMade),
    failedReason: job.failedReason ?? null,
    data: job.data ?? {},
    options: readRecord(job.opts) ?? {},
  };
}

function sourceJobFromCheckpoint(
  source: NonNullable<GenerationQueueJobOperationCheckpoint["source"]>,
): GenerationQueueJobOpsClient {
  return {
    id: source.jobId,
    name: source.jobName,
    attemptsMade: source.attemptsMade,
    failedReason: source.failedReason,
    data: source.data,
    opts: source.options as JobsOptions,
    async getState() { return source.state; },
    async remove() {},
  };
}

function readReplayOptions(value: unknown): JobsOptions {
  const source = readRecord(value) ?? {};
  return {
    attempts: positiveInteger(source.attempts) ?? 1,
    backoff: source.backoff as JobsOptions["backoff"],
    removeOnComplete: source.removeOnComplete as JobsOptions["removeOnComplete"],
    removeOnFail: source.removeOnFail as JobsOptions["removeOnFail"],
    priority: positiveInteger(source.priority),
  };
}

function replayToken(failedAt: unknown, deadLetterJobId: string) {
  return (readString(failedAt) || deadLetterJobId).replace(/[^a-zA-Z0-9_-]/g, "_");
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value: unknown) {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : undefined;
}

function configuredQueueNames(config: GenerationQueueConfig) {
  return [
    config.queues.submitImage,
    config.queues.submitVideo,
    config.queues.pollImage,
    config.queues.pollVideo,
    config.queues.pollAudio,
    config.queues.finalizeArtifact,
    config.queues.deadLetter,
  ];
}

function isDynamicGenerationWorkQueue(queueName: string) {
  // Dynamic names are generated as generation-{media}-{stage}-{route}-{shard}.
  // Keep this intentionally strict so an arbitrary admin queue cannot opt into
  // replay validation merely by sharing a prefix.
  return /^generation-(image|video|audio)-(submit|poll|fetch|persist)-[a-z0-9]+-\d{3}$/.test(queueName);
}

function numberOrZero(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function redisConnectionFromUrl(redisUrl: string) {
  const url = new URL(redisUrl);
  const tlsEnabled = url.protocol === "rediss:";
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: decodeURIComponent(url.username || ""),
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    tls: tlsEnabled ? {} : undefined,
    connectTimeout: 2_000,
    commandTimeout: 5_000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: (attempt: number) => Math.min(attempt * 100, 1_000),
  };
}
