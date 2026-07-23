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
  redactedResponse: Record<string, unknown>;
  artifacts?: MediaGenerationArtifact[];
  videoUrl?: string;
}

export interface MediaGenerationArtifact {
  mediaType: "image" | "video" | "audio";
  mimeType?: string | null;
  fileExtension?: string | null;
  url?: string;
  b64Json?: string;
}

export interface ProviderAdapter {
  submit(input: ProviderSubmissionInput): Promise<ProviderSubmissionResult>;
  poll?(input: { externalRequestId: string }): Promise<ProviderPollResult>;
}

export async function recordProviderAdapterRequest(
  input: ProviderSubmissionInput,
  request: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  await input.recordRedactedRequest?.(request);
  return request;
}
