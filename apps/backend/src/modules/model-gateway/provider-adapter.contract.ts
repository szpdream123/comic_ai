import type { ProviderRequestStatus } from "../../../../../packages/contracts/domain/states.ts";

export interface ProviderSubmissionInput {
  providerRequestId: string;
  providerName: string;
  providerOperation: string;
  requestKey: string;
  payloadRef: string;
  payloadHash: string;
  redactedPayload: Record<string, unknown>;
}

export interface ProviderSubmissionResult {
  externalRequestId: string;
  status: Extract<ProviderRequestStatus, "accepted" | "running" | "succeeded">;
  redactedResponse?: Record<string, unknown>;
  artifacts?: MediaGenerationArtifact[];
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
}
