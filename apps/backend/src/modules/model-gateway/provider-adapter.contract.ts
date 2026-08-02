import type { ProviderRequestStatus } from "../../../../../packages/contracts/domain/states.ts";

export interface ProviderSubmissionInput {
  providerRequestId: string;
  providerName: string;
  providerOperation: string;
  requestKey: string;
  payloadRef: string;
  payloadHash: string;
  redactedPayload: Record<string, unknown>;
  recordRedactedRequest?: (request: Record<string, unknown>) => Promise<void>;
}

export interface ProviderSubmissionResult {
  externalRequestId: string;
  status: Extract<ProviderRequestStatus, "accepted" | "running" | "succeeded">;
  redactedRequest?: Record<string, unknown>;
  redactedResponse?: Record<string, unknown>;
  artifacts?: MediaGenerationArtifact[];
}

export interface ProviderPollResult {
  status: Extract<ProviderRequestStatus, "accepted" | "running" | "succeeded" | "failed">;
  /** A provider may advance a durable multi-stage task to a new external id. */
  externalRequestId?: string;
  redactedResponse: Record<string, unknown>;
  artifacts?: MediaGenerationArtifact[];
  videoUrl?: string;
}

export interface ProviderPollInput {
  externalRequestId: string;
  /** Persisted request snapshot used by adapters that need immutable I/O metadata while polling. */
  redactedPayload?: Record<string, unknown>;
}

export interface ProviderCancellationResult {
  // `failed` is retained for existing adapters; new adapters should use `unknown`
  // when the Provider outcome cannot be confirmed.
  status: "canceled" | "not_cancelable" | "unknown" | "failed";
  redactedResponse: Record<string, unknown>;
}

export interface MediaGenerationArtifact {
  mediaType: "image" | "video" | "audio";
  mimeType?: string | null;
  fileExtension?: string | null;
  url?: string;
  b64Json?: string;
  /** Structured text returned by audio transcription providers. */
  transcript?: string | null;
  /** Lyrics returned by music-generation providers. */
  lyrics?: string | null;
  /** Optional title returned by music-generation providers. */
  title?: string | null;
}

export interface ProviderAdapter {
  submit(input: ProviderSubmissionInput): Promise<ProviderSubmissionResult>;
  recoverSubmission?(
    input: ProviderSubmissionInput & { externalSubmissionStartedAt?: Date | null },
  ): Promise<ProviderSubmissionResult | null>;
  poll?(input: ProviderPollInput): Promise<ProviderPollResult>;
  cancel?(input: { externalRequestId: string }): Promise<ProviderCancellationResult>;
}

export async function recordProviderAdapterRequest(
  input: ProviderSubmissionInput,
  request: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  await input.recordRedactedRequest?.(request);
  return request;
}
