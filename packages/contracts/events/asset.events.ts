import { eventTypes } from "../domain/event-types.ts";
import { baseEnvelopeFields, type EventContract } from "./types.ts";

export const assetVersionCreatedEvent: EventContract = {
  eventType: eventTypes.assetVersionCreated,
  schemaVersion: 1,
  producer: "asset",
  envelopeFields: [...baseEnvelopeFields, "project_id"],
  sourceIds: [
    "asset_id",
    "asset_version_id",
    "source_task_id",
    "source_attempt_id",
  ],
  deduplicationKeys: ["asset_version_id"],
  payloadShape: {
    asset_id: "uuid",
    asset_version_id: "uuid",
    source_task_id: "uuid?",
    source_attempt_id: "uuid?",
    source_provider_request_id: "uuid?",
  },
  consumers: ["quality-review", "admin-ops"],
};

export const assetEventContracts = [assetVersionCreatedEvent];
