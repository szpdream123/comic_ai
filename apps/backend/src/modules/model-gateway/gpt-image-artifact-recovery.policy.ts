const minuteMs = 60_000;
const hourMs = 60 * minuteMs;
const recoveryWindowMs = 6 * hourMs;
const retryDelaysMs = [
  2 * minuteMs,
  5 * minuteMs,
  15 * minuteMs,
  30 * minuteMs,
  hourMs,
  2 * hourMs,
  2 * hourMs,
] as const;

export interface GptImageArtifactRecoveryState {
  state: "retry_pending" | "manual_review";
  round: number;
  startedAt: Date;
  nextRetryAt: Date | null;
  deadlineAt: Date;
  lastFailureCode: string;
  lastErrorMessage: string | null;
  warning: boolean;
}

export type GptImageArtifactRecoveryDecision =
  | (GptImageArtifactRecoveryState & {
      action: "retry";
      state: "retry_pending";
      nextRetryAt: Date;
    })
  | (GptImageArtifactRecoveryState & {
      action: "manual_review";
      state: "manual_review";
      nextRetryAt: null;
      reason: "permanent_failure" | "recovery_exhausted" | "recovery_deadline_reached";
    });

export function planGptImageArtifactRecovery(input: {
  now: Date;
  previous: unknown;
  failure: unknown;
}): GptImageArtifactRecoveryDecision {
  const previous = parseGptImageArtifactRecoveryState(input.previous);
  const startedAt = previous?.startedAt ?? input.now;
  const deadlineAt = previous?.deadlineAt ?? new Date(startedAt.getTime() + recoveryWindowMs);
  const round = (previous?.round ?? 0) + 1;
  const failure = normalizeRecoveryFailure(input.failure);
  const common = {
    round,
    startedAt,
    deadlineAt,
    lastFailureCode: failure.failureCode,
    lastErrorMessage: failure.message,
    warning: round >= 6,
  };

  if (classifyGptImageArtifactRecoveryFailure(input.failure).kind === "permanent") {
    return {
      action: "manual_review",
      state: "manual_review",
      nextRetryAt: null,
      reason: "permanent_failure",
      ...common,
    };
  }

  if (input.now.getTime() >= deadlineAt.getTime()) {
    return {
      action: "manual_review",
      state: "manual_review",
      nextRetryAt: null,
      reason: "recovery_deadline_reached",
      ...common,
    };
  }

  const delayMs = retryDelaysMs[round - 1];
  if (delayMs === undefined) {
    return {
      action: "manual_review",
      state: "manual_review",
      nextRetryAt: null,
      reason: "recovery_exhausted",
      ...common,
    };
  }

  const nextRetryAt = new Date(input.now.getTime() + delayMs);
  if (nextRetryAt.getTime() >= deadlineAt.getTime()) {
    return {
      action: "manual_review",
      state: "manual_review",
      nextRetryAt: null,
      reason: "recovery_deadline_reached",
      ...common,
    };
  }

  return {
    action: "retry",
    state: "retry_pending",
    nextRetryAt,
    ...common,
  };
}

export function classifyGptImageArtifactRecoveryFailure(
  value: unknown,
): { kind: "transient" | "permanent"; reason: string } {
  const failure = normalizeRecoveryFailure(value);
  if ([
    "provider_output_missing",
    "provider_output_persist_failed",
  ].includes(failure.failureCode)) {
    return { kind: "permanent", reason: failure.failureCode };
  }

  if (failure.httpStatus !== null) {
    if ([400, 401, 403, 404, 409, 410, 422].includes(failure.httpStatus)) {
      return { kind: "permanent", reason: `http_${failure.httpStatus}` };
    }
    if (failure.httpStatus === 408 || failure.httpStatus === 429 || failure.httpStatus >= 500) {
      return { kind: "transient", reason: `http_${failure.httpStatus}` };
    }
  }

  const permanentMessagePatterns = [
    "provider_artifact_too_large",
    "provider_artifact_mime_invalid",
    "provider_artifact_url_",
    "gpt_image_artifact_source_missing",
    "storage_put_object_required",
    "storage_bucket_required",
    "storage_endpoint_required",
  ];
  if (permanentMessagePatterns.some((pattern) => failure.message?.toLowerCase().includes(pattern))) {
    return { kind: "permanent", reason: "invalid_or_unusable_artifact" };
  }

  return { kind: "transient", reason: "retryable_artifact_transfer" };
}

export function parseGptImageArtifactRecoveryState(
  value: unknown,
): GptImageArtifactRecoveryState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const state = record.state === "retry_pending" || record.state === "manual_review"
    ? record.state
    : null;
  const round = Number(record.round);
  const startedAt = parseDate(record.startedAt);
  const deadlineAt = parseDate(record.deadlineAt);
  const nextRetryAt = record.nextRetryAt == null ? null : parseDate(record.nextRetryAt);
  if (
    !state ||
    !Number.isInteger(round) ||
    round < 1 ||
    !startedAt ||
    !deadlineAt ||
    (state === "retry_pending" && !nextRetryAt)
  ) {
    return null;
  }
  return {
    state,
    round,
    startedAt,
    nextRetryAt,
    deadlineAt,
    lastFailureCode: boundedString(record.lastFailureCode, 160) || "provider_output_storage_failed",
    lastErrorMessage: boundedString(record.lastErrorMessage, 512),
    warning: record.warning === true || round >= 6,
  };
}

export function isGptImageArtifactRecoveryDue(
  state: GptImageArtifactRecoveryState | null,
  now: Date,
): boolean {
  return Boolean(
    state?.state === "retry_pending" &&
      state.nextRetryAt &&
      state.nextRetryAt.getTime() <= now.getTime() &&
      state.deadlineAt.getTime() > now.getTime(),
  );
}

export function isGptImageArtifactRecoveryExpired(
  state: GptImageArtifactRecoveryState | null,
  now: Date,
): boolean {
  return Boolean(state && state.deadlineAt.getTime() <= now.getTime());
}

export function serializeGptImageArtifactRecoveryState(
  state: GptImageArtifactRecoveryState,
): Record<string, unknown> {
  return {
    state: state.state,
    round: state.round,
    startedAt: state.startedAt.toISOString(),
    nextRetryAt: state.nextRetryAt?.toISOString() ?? null,
    deadlineAt: state.deadlineAt.toISOString(),
    lastFailureCode: state.lastFailureCode,
    lastErrorMessage: state.lastErrorMessage,
    warning: state.warning,
  };
}

function normalizeRecoveryFailure(value: unknown) {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const metadata = record.$metadata && typeof record.$metadata === "object"
    ? record.$metadata as Record<string, unknown>
    : {};
  const cause = record.cause && typeof record.cause === "object"
    ? record.cause as Record<string, unknown>
    : {};
  return {
    failureCode:
      boundedString(record.failureCode, 160) ||
      boundedString(cause.failureCode, 160) ||
      "provider_output_storage_failed",
    message:
      boundedString(record.message, 512) ||
      boundedString(cause.message, 512),
    httpStatus: parseHttpStatus(
      record.httpStatus ??
        record.statusCode ??
        metadata.httpStatusCode ??
        cause.httpStatus ??
        cause.statusCode,
    ),
  };
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return new Date(value.getTime());
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function parseHttpStatus(value: unknown): number | null {
  const status = Number(value);
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim().slice(0, maxLength);
}
