const TASK_CENTER_PROVIDER_DIAGNOSTICS_MAX_BYTES = 8 * 1024;
const TASK_CENTER_PROVIDER_NESTED_FIELDS = [
  "providerRawResponse",
  "responseBodyPreview",
  "responseBody",
  "body",
  "providerMessage",
  "errorMessage",
  "message",
  "reason",
  "displayMessage",
  "details",
  "providerErrorCode",
  "errorCode",
  "code",
  "failureCode",
  "httpStatus",
  "status",
  "statusCode",
  "statusText",
  "contentType",
  "requestId",
  "request_id",
  "name",
  "localStage",
  "localError",
  "internalError",
  "expectedTaskId",
  "expectedAttemptId",
  "requestTaskId",
  "requestAttemptId",
  "taskStatus",
  "taskCurrentAttemptId",
  "attemptStatus",
  "externalSubmissionStartedAt",
  "externalRequestId",
  // Pre-submission classification. The worker records these on every failed
  // submit, but they were absent from this whitelist, so the projection dropped
  // them and the admin view showed only a generic failure code with no context.
  "retryable",
  "providerStatus",
  "providerAttemptId",
  "providerExternalSubmissionStartedAt",
  "providerExternalRequestId",
  "lookup",
  "phase",
  "diagnosticNote",
  "submissionWasNotStarted",
  "preSubmissionRetryCount",
  "previousStatus",
  "requeuedAttemptId",
  "requeuedAt",
] as const;
const TASK_CENTER_PROVIDER_CONTAINER_FIELDS = [
  "diagnostics",
  "providerDiagnostics",
  "error",
  "response",
  "modelError",
  "localState",
  "diagnosticsLookupError",
] as const;
const TASK_CENTER_PROVIDER_SCALAR_FIELDS = [
  ...TASK_CENTER_PROVIDER_NESTED_FIELDS,
  "preSubmissionRetryLimit",
  "providerRequestLookup",
] as const;
const TASK_CENTER_PROVIDER_DIAGNOSTIC_FIELDS = [
  ...TASK_CENTER_PROVIDER_CONTAINER_FIELDS,
  ...TASK_CENTER_PROVIDER_SCALAR_FIELDS,
].map((field) => [field, taskCenterProviderDiagnosticFieldMaxBytes(field)] as const);

export function buildTaskCenterProviderDiagnostics(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const summary: Record<string, unknown> = {};
  for (const field of TASK_CENTER_PROVIDER_CONTAINER_FIELDS) {
    const nested = buildTaskCenterNestedProviderDiagnostics(record[field]);
    if (nested) summary[field] = nested;
  }
  for (const field of TASK_CENTER_PROVIDER_SCALAR_FIELDS) {
    const scalar = field === "localError" || field === "internalError"
      ? buildTaskCenterNestedProviderDiagnostics(record[field])
      : boundedTaskCenterProviderScalar(record[field], taskCenterProviderDiagnosticFieldMaxBytes(field));
    if (scalar !== undefined && scalar !== null) summary[field] = scalar;
  }
  // Preserve the pre-submission history appended by the requeue path. It is an
  // array, so neither the container nor the scalar branch above would keep it.
  const retryHistory = buildTaskCenterRetryHistory(record.preSubmissionRetryHistory);
  if (retryHistory) summary.preSubmissionRetryHistory = retryHistory;
  if (Object.keys(summary).length === 0) return null;
  return Buffer.byteLength(JSON.stringify(summary), "utf8") <= TASK_CENTER_PROVIDER_DIAGNOSTICS_MAX_BYTES
    ? summary
    : { omitted: true, reason: "oversized_provider_diagnostics" };
}

function buildTaskCenterNestedProviderDiagnostics(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const summary: Record<string, unknown> = {};
  for (const field of TASK_CENTER_PROVIDER_NESTED_FIELDS) {
    const scalar = boundedTaskCenterProviderScalar(record[field], taskCenterNestedDiagnosticFieldMaxBytes(field));
    if (scalar !== undefined) summary[field] = scalar;
  }
  return Object.keys(summary).length > 0 ? summary : null;
}

const TASK_CENTER_RETRY_HISTORY_MAX_ENTRIES = 10;

function isTaskCenterNestedProjectedField(field: string) {
  return TASK_CENTER_PROVIDER_CONTAINER_FIELDS.includes(
    field as (typeof TASK_CENTER_PROVIDER_CONTAINER_FIELDS)[number],
  );
}

function buildTaskCenterRetryHistory(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return null;
  const entries = value
    .slice(-TASK_CENTER_RETRY_HISTORY_MAX_ENTRIES)
    .map((entry) => buildTaskCenterNestedProviderDiagnostics(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
  return entries.length > 0 ? entries : null;
}

function boundedTaskCenterProviderScalar(value: unknown, maximumBytes: number): unknown {
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value !== "string" || !value.trim()) return undefined;
  if (Buffer.byteLength(value, "utf8") <= maximumBytes) return value;
  let low = 0;
  let high = value.length;
  while (low < high) {
    const midpoint = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(value.slice(0, midpoint), "utf8") <= maximumBytes) low = midpoint;
    else high = midpoint - 1;
  }
  return `${value.slice(0, Math.max(0, low - 32))}...[truncated]`;
}

function taskCenterProviderDiagnosticFieldMaxBytes(field: string) {
  if (field === "diagnostics") return 2 * 1024;
  if (field === "providerDiagnostics") return 1024;
  if (field === "providerRawResponse" || field === "responseBodyPreview") return 1024;
  return 160;
}

function taskCenterNestedDiagnosticFieldMaxBytes(field: string) {
  if (field === "responseBodyPreview") return 1024;
  if (["providerRawResponse", "responseBody", "body", "error", "errors"].includes(field)) return 512;
  if (["providerMessage", "errorMessage", "message", "reason", "displayMessage", "details"].includes(field)) return 256;
  return 128;
}

function taskCenterNestedDiagnosticsSql(diagnosticsExpression: string) {
  const extractedColumns = TASK_CENTER_PROVIDER_NESTED_FIELDS
    .map((field) => `"${field}" jsonb`)
    .join(",\n");
  const projectedFields = TASK_CENTER_PROVIDER_NESTED_FIELDS.flatMap((field) => [
    `'${field}'`,
    `CASE
      WHEN octet_length(CASE
        WHEN jsonb_typeof(nested_diagnostics."${field}") = 'string' THEN nested_diagnostics."${field}" #>> '{}'
        ELSE COALESCE(nested_diagnostics."${field}", 'null'::jsonb)::text
      END) <= ${taskCenterNestedDiagnosticFieldMaxBytes(field)}
      THEN nested_diagnostics."${field}"
      ELSE jsonb_build_object('omitted', true, 'reason', 'oversized_provider_diagnostic_field')
    END`,
  ]).join(",\n");
  return `CASE
    WHEN ${diagnosticsExpression} IS NULL THEN NULL::jsonb
    ELSE (
      SELECT jsonb_strip_nulls(jsonb_build_object(${projectedFields}))
      FROM jsonb_to_record(
        CASE
          WHEN jsonb_typeof(${diagnosticsExpression}) = 'object' THEN ${diagnosticsExpression}
          ELSE '{}'::jsonb
        END
      ) AS nested_diagnostics(${extractedColumns})
    )
  END`;
}

export function taskCenterProviderDiagnosticsSql(responseExpression: string) {
  if (!/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/i.test(responseExpression)) {
    throw new Error("task_center_provider_response_expression_invalid");
  }

  // Simplified approach: directly return the pre-processed task_center_diagnostics_json.
  // This field is already filtered and size-limited by buildTaskCenterProviderDiagnostics()
  // when written to the database, so we don't need to re-project it here with 100+ SQL params.
  return `CASE
    WHEN ${responseExpression} IS NULL THEN NULL::jsonb
    WHEN jsonb_typeof(${responseExpression}) = 'object' THEN ${responseExpression}
    ELSE NULL::jsonb
  END`;
  return `CASE
    WHEN ${responseExpression} IS NULL THEN NULL::jsonb
    ELSE (
      SELECT CASE
        WHEN octet_length(projected.value::text) <= ${TASK_CENTER_PROVIDER_DIAGNOSTICS_MAX_BYTES}
        THEN projected.value
        ELSE jsonb_build_object('omitted', true, 'reason', 'oversized_provider_diagnostics')
      END
      FROM jsonb_to_record(
        CASE
          WHEN jsonb_typeof(${responseExpression}) = 'object' THEN ${responseExpression}
          ELSE '{}'::jsonb
        END
      ) AS provider_diagnostics(${extractedColumns})
      CROSS JOIN LATERAL (SELECT ${projectedResponse} AS value) projected
    )
  END`;
}
