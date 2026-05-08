import type { EventType } from "../domain/event-types.ts";

export interface EventContract {
  eventType: EventType;
  schemaVersion: number;
  producer: string;
  envelopeFields: string[];
  sourceIds: string[];
  deduplicationKeys: string[];
  payloadShape: Record<string, unknown>;
  consumers: string[];
}

export const baseEnvelopeFields = [
  "event_id",
  "event_type",
  "schema_version",
  "producer",
  "occurred_at",
  "organization_id",
  "payload",
] as const;
