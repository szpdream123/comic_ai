import type { AiModelConfigRecord } from "../../backend/src/modules/model-catalog/ai-model-config.store.ts";

export type ModelConfig = AiModelConfigRecord;
export type Operation = "text" | "video" | "speech" | "transcription";
export type RequestStatus = "queued" | "submitting" | "running" | "succeeded" | "failed" | "result_unknown";
export type Usage = Record<string, number> | null;
export interface ModelResult {
  content?: string;
  toolCalls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  videoUrl?: string;
  audioUrl?: string;
  transcript?: string;
  usage: Usage;
}
export interface ExecutionResult {
  status: "running" | "succeeded" | "failed";
  externalId?: string;
  result: ModelResult;
  error?: string;
}
export interface ProviderExecutor {
  supports(model: ModelConfig, operation: Operation): boolean;
  submit(model: ModelConfig, operation: Operation, payload: Record<string, unknown>, requestId: string): Promise<ExecutionResult>;
  poll(model: ModelConfig, operation: Operation, payload: Record<string, unknown>, externalId: string, requestId: string): Promise<ExecutionResult>;
}
export interface StoredRequest {
  id: string;
  productId: string;
  subjectId: string;
  requestKey: string;
  requestHash: string;
  operation: Operation;
  model: ModelConfig;
  payload: Record<string, unknown>;
  status: RequestStatus;
  externalId: string | null;
  result: ModelResult | null;
  error: string | null;
  leaseToken: string | null;
  leaseUntil: Date | null;
  nextRunAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
export type NewRequest = Pick<StoredRequest, "productId" | "subjectId" | "requestKey" | "requestHash" | "operation" | "model" | "payload">;
export interface RequestStore {
  rememberNonce(productId: string, keyId: string, nonce: string, expiresAt: Date, now: Date): Promise<boolean>;
  create(input: NewRequest, now: Date): Promise<{ request: StoredRequest; created: boolean }>;
  findByKey(productId: string, subjectId: string, requestKey: string): Promise<StoredRequest | null>;
  get(id: string, productId: string, subjectId: string): Promise<StoredRequest | null>;
  claim(now: Date, leaseMs: number, id?: string): Promise<StoredRequest | null>;
  renew(id: string, leaseToken: string, now: Date, leaseMs: number): Promise<boolean>;
  finish(id: string, leaseToken: string, update: {
    status: "running" | "succeeded" | "failed" | "result_unknown";
    externalId?: string | null;
    result?: ModelResult | null;
    error?: string | null;
    nextRunAt: Date;
  }, now: Date): Promise<boolean>;
  recoverExpired(now: Date): Promise<void>;
}
export class ModelServiceError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
