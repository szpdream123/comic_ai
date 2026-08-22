import { UnrecoverableError } from "bullmq";

const NON_RETRYABLE_MESSAGE_PATTERNS = [
  /(?:^|_)state_conflict(?:$|:)/,
  /^generation_queue_assignment_already_released$/,
  /_processor_missing$/,
  /^unsupported_(?:image|video|audio|finalize|fetch|persist)_provider_executor:/,
];

const TERMINAL_STATE_NOOP_MESSAGES = new Set([
  "task_finalization_state_conflict",
  "provider_request_terminal_state_conflict",
]);

const TRANSIENT_NETWORK_MESSAGE_PATTERN =
  /(?:fetch failed|network|socket|connection|timed?\s*out|econn|eai_again|enotfound|etimedout|und_err|aborted)/i;

export function shouldSettleGenerationTaskAfterQueueError(
  error: unknown,
  attemptsMade: number,
  configuredAttempts: number,
): boolean {
  if (error instanceof Error && error.message === "generation_queue_assignment_already_released") {
    return false;
  }
  return isUnrecoverableGenerationQueueError(error)
    || Number(attemptsMade) >= Math.max(1, Number(configuredAttempts) || 1);
}

export function isUnrecoverableGenerationQueueError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "UnrecoverableError") return true;

  if (NON_RETRYABLE_MESSAGE_PATTERNS.some((pattern) => pattern.test(error.message))) {
    return true;
  }

  if (error instanceof ReferenceError || error instanceof SyntaxError
    || error instanceof RangeError || error instanceof EvalError) {
    return true;
  }

  return error instanceof TypeError && !isTransientNetworkError(error);
}

export function shouldKeepGenerationDeadLetter(
  taskStatus: unknown,
  providerStatus: unknown,
): boolean {
  const terminalStatuses = new Set(["failed", "canceled"]);
  return !terminalStatuses.has(String(taskStatus ?? "").trim().toLowerCase())
    && !terminalStatuses.has(String(providerStatus ?? "").trim().toLowerCase());
}

export async function runGenerationQueueJobWithRetryPolicy<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isGenerationQueueTerminalStateNoopError(error)) {
      return undefined as T;
    }
    if (!isUnrecoverableGenerationQueueError(error) || error instanceof UnrecoverableError) {
      throw error;
    }
    throw new UnrecoverableError(error.message);
  }
}

export function isGenerationQueueTerminalStateNoopError(error: unknown): boolean {
  return error instanceof Error && TERMINAL_STATE_NOOP_MESSAGES.has(error.message);
}

function isTransientNetworkError(error: Error): boolean {
  let current: unknown = error;
  const visited = new Set<unknown>();
  while (current && !visited.has(current)) {
    visited.add(current);
    if (current instanceof Error && TRANSIENT_NETWORK_MESSAGE_PATTERN.test(current.message)) {
      return true;
    }
    if (typeof current === "object") {
      const code = "code" in current ? String(current.code ?? "") : "";
      if (TRANSIENT_NETWORK_MESSAGE_PATTERN.test(code)) return true;
      current = "cause" in current ? current.cause : undefined;
      continue;
    }
    break;
  }
  return false;
}
